'use client';

/**
 * UniverTable — the single smart-table editor (Univer OSS, Apache-2.0) for
 * BOTH directions (تعريب شامل — comprehensive Arabization).
 *
 * Replaces the hand-rolled SmartTable/ExcelGridEditor grids. Univer owns ALL
 * grid behaviour: selection, autofill, formulas, formatting, merges,
 * undo/redo, clipboard. This component only bridges:
 *
 *   Univer commands → (debounced) → snapshot → TableEntity persistence
 *   TipTap bridge  → smart-table-active announce + delete-table/rename commands
 *
 * Canonical state remains entity.univerSnapshot; columns_data/rows_data/…
 * are a derived cache regenerated on save (see lib/grid/univer-adapter).
 *
 * COMPREHENSIVE ARABIZATION (single engine):
 * - RTL sheet → ورقة عربية كاملة: واجهة ar-SA (toolbar/menus/formula-bar/
 *   sheet-tabs/context-menu)، rightToLeft=1، محاذاة يمين افتراضية، خط عربي
 *   (Tahoma/Segoe UI)، lang="ar"، وchrome معكوس DOM (headerbar/footer).
 * - LTR sheet → ورقة إنجليزية: واجهة en-US، محاذاة يسار، lang="en".
 * - نص الخلايا ثنائي الاتجاه من المحرك المورّد نفسه (vendor/univer-rtl:
 *   v0.25.1 + upstream PR #7011 — bidi-reorder + implicit direction via
 *   first-strong-char، في المحرر والخلايا معًا). لا محرك bidi مخصص هنا.
 * - عكس إطار الشبكة (عمود A يمين، أرقام الصفوف يمين) من وحدة
 *   lib/grid/univer-rtl-frame (ترقيع view-layer لكل ورقة RTL: إحداثيات
 *   الـ skeleton + مستطيلات الـ viewports + موضع التمرير الابتدائي).
 *   البيانات والصيغ لا تتحرك أبدًا — العكس للعرض فقط.
 */

import React, { useEffect, useRef, useState } from 'react';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import UniverPresetSheetsCoreArSA from '@univerjs/preset-sheets-core/locales/ar-SA';
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import '@univerjs/preset-sheets-core/lib/index.css';

import { getTableById, saveTable, getTableDirection } from '@/lib/db';
import { isTableTombed } from '@/lib/db-intelligence';
import type { TableEntity } from '@/lib/types';
import {
  entityToUniverSnapshot,
  univerSnapshotToDerived,
  applyColumnNames,
  needsUniverMigration,
  sanitizeSnapshotForBoot,
  UNIVER_SHEET_ID,
} from '@/lib/grid/univer-adapter';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PageLoading } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export interface UniverTableProps {
  tableId: string;
  reportId?: string;
  mode?: 'embedded-edit' | 'full-screen';
  onCloseFullScreen?: () => void;
  onNavigateToContent?: () => void;
  onDeleteNode?: () => void;
}

export function UniverTable({
  tableId,
  reportId,
  mode = 'embedded-edit',
  onCloseFullScreen,
  onNavigateToContent,
  onDeleteNode,
}: UniverTableProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<{ univer: any; univerAPI: any; workbook: any } | null>(null);
  const entityRef = useRef<TableEntity | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotJsonRef = useRef<string>('');
  const mountedRef = useRef(true);
  const isArRef = useRef(isAr);
  isArRef.current = isAr;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [tableName, setTableName] = useState('');
  const [confirmNode, askConfirm] = useConfirm();
  const askConfirmRef = useRef(askConfirm);
  askConfirmRef.current = askConfirm;
  // Full re-init generation: direction toggle / clear-values reboot the
  // whole Univer instance from the fresh snapshot (like a page reload)
  // instead of fragile workbook surgery that left the stale sheet on
  // screen. Bumped by the smart-table-rebuild listener below.
  const [epoch, setEpoch] = useState(0);
  // Set before bumping epoch so the teardown of the outgoing instance
  // skips its unmount flush — it would otherwise re-save the PRE-rebuild
  // snapshot (old direction / cleared values) over the fresh save.
  const skipFlushRef = useRef(false);
  // RTL frame (Excel-style grid mirroring, lib/grid/univer-rtl-frame):
  // module handle + live render context for drift repair, retry timer for
  // the async scene boot. Per-sheet gated inside the module; LTR untouched.
  const rtlFrameRef = useRef<any>(null);
  const rtlCtxRef = useRef<{ scene: any; skeleton: any } | null>(null);
  const rtlLayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus bridge: announce on CLICK completion (capture), never on
  // mousedown/focus. Announcing mid-gesture renders the editor sub-toolbar
  // above the sheet, shifting it ~41px down while the pointer is held —
  // mouseup then misses and every Univer button (tabs, toolbar, fx ✓/✗)
  // feels dead. Click-first keeps the gesture pixel-stable.
  const announceActive = React.useCallback(() => {
    try {
      window.dispatchEvent(
        new CustomEvent('smart-table-active', {
          detail: { tableId, name: entityRef.current?.name || '' },
        })
      );
    } catch {}
  }, [tableId]);

  // Persist the current snapshot (debounced entry point).
  const persistSnapshot = async (snapshot: any) => {
    const prev = entityRef.current;
    if (!prev || !snapshot || typeof snapshot !== 'object' || !snapshot.sheets) return;
    try {
      // Deleted in this session (or tombstoned): never resurrect via a late save.
      try {
        const { isTableDeletedInSession } = await import('@/lib/db-intelligence');
        if (isTableDeletedInSession(tableId) || isTableTombed(tableId)) return;
      } catch {}
      if (mountedRef.current) setSaveStatus('saving');
      const derived = univerSnapshotToDerived(snapshot);
      const prevNames: Array<string | undefined> = Array.isArray((prev as any).columns_data)
        ? (prev as any).columns_data.map((c: any) => c?.name)
        : [];
      applyColumnNames(derived, prevNames);
      const updated: TableEntity = {
        ...(prev as TableEntity),
        name: typeof (prev as any).name === 'string' ? (prev as any).name : derived.name,
        // Sync direction from the live snapshot (Excel-like): a direction
        // toggle that only changed the snapshot flag must not be reverted
        // to the stale entity flag by the next keystroke save.
        direction: derived.direction,
        univerSnapshot: snapshot,
        columns_data: derived.columns as any,
        rows_data: derived.rows,
        cell_formats: derived.cellFormats as any,
        merged_cells: derived.mergedCells as any,
        updated_at: new Date().toISOString(),
      };
      const saved = await saveTable(updated);
      entityRef.current = saved as TableEntity;
      try {
        window.dispatchEvent(new CustomEvent('smart-table-updated', { detail: { tableId } }));
      } catch {}
      if (mountedRef.current) setSaveStatus('saved');
    } catch (err) {
      console.error('UniverTable save failed:', err);
      if (mountedRef.current) setSaveStatus('error');
    }
  };

  // Flush any pending debounced save immediately (unmount / navigation).
  const flushPendingSave = () => {
    void flushNow();
  };
  // Awaitable flush used by the SmartTableView handshake before direction
  // toggle / clear / repair: resolves true when a save was persisted.
  const flushNow = async (): Promise<boolean> => {
    try {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // Never flush after a delete — this was the resurrection path.
      try {
        if (isTableTombed(tableId)) return false;
      } catch {}
      const workbook = runtimeRef.current?.workbook;
      if (!workbook) return false;
      let snapshot: any = null;
      try {
        snapshot = workbook.save ? workbook.save() : workbook.getSnapshot();
      } catch {
        return false;
      }
      if (!snapshot) return false;
      let json = '';
      try {
        json = JSON.stringify(snapshot);
      } catch {
        return false;
      }
      if (json && json !== lastSnapshotJsonRef.current) {
        lastSnapshotJsonRef.current = json;
        await persistSnapshot(snapshot);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };
  const flushNowRef = useRef(flushNow);
  flushNowRef.current = flushNow;
  const flushPendingSaveRef = useRef(flushPendingSave);
  flushPendingSaveRef.current = flushPendingSave;

  const scheduleSave = () => {
    try {
      const workbook = runtimeRef.current?.workbook;
      if (!workbook) return;
      let snapshot: any = null;
      try {
        snapshot = workbook.save ? workbook.save() : workbook.getSnapshot();
      } catch (err) {
        console.error('UniverTable snapshot read failed (ignored):', err);
        return;
      }
      if (!snapshot || typeof snapshot !== 'object' || !snapshot.sheets) return;
      let json = '';
      try {
        json = JSON.stringify(snapshot);
      } catch {
        return;
      }
      if (!json || json === lastSnapshotJsonRef.current) return;
      lastSnapshotJsonRef.current = json;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void persistSnapshot(snapshot);
      }, 800);
    } catch (err) {
      console.error('UniverTable scheduleSave failed (ignored):', err);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    if (!tableId) {
      setLoadError(isArRef.current ? 'تعذّر تحميل الجدول.' : 'Could not load table.');
      setLoading(false);
      return;
    }

    let disposed = false;
    let univer: any = null;
    let container: HTMLDivElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let chromeRetryTimer: ReturnType<typeof setTimeout> | null = null;

    // Mirrors the FULL Univer chrome (headerbar: toolbar + formula bar,
    // footer: sheet tabs + status/zoom, plus any toolbar/formula-bar nodes)
    // with the sheet direction. This is DOM chrome only — the same `dir`
    // mechanism upstream's merged RTL PRs use (their CSS ships `[dir=rtl]`
    // variants for exactly this). It does NOT and cannot fix canvas text
    // rendering (that comes from vendor/univer-rtl bidi — see file header).
    // Scoped strictly to chrome: the canvas viewport stays LTR (mount node
    // below keeps dir="ltr"), so there is no scroll/coordinate risk.
    // Also stamps lang (ar/en) + Arabic-capable font on chrome so Arabic
    // menus/buttons shape correctly. Returns true when the headerbar applied.
    // Portal menus live outside the sheet root (document.body). Patches only
    // Univer-owned menu nodes; safe to call repeatedly, never observes.
    const patchGlobalMenus = (rtl: boolean): void => {
      try {
        if (typeof document === 'undefined') return;
        const want = rtl ? 'rtl' : 'ltr';
        const lang = rtl ? 'ar' : 'en';
        const selectors = [
          '.univer-context-menu',
          '.univer-menu',
          '[data-u-comp="context-menu"]',
          '[data-u-comp*="menu"]',
        ];
        for (const sel of selectors) {
          try {
            document.querySelectorAll(sel).forEach((el) => {
              const node = el as HTMLElement;
              if (node.getAttribute('dir') !== want) node.setAttribute('dir', want);
              if (node.getAttribute('lang') !== lang) node.setAttribute('lang', lang);
            });
          } catch {}
        }
      } catch {}
    };

    const patchChromeDir = (root: HTMLElement, rtl: boolean): boolean => {
      try {
        const want = rtl ? 'rtl' : 'ltr';
        const lang = rtl ? 'ar' : 'en';
        let headerFound = false;
        // Known chrome selectors (Univer renames classes between minors —
        // query broadly, touch only what exists; never throw).
        const selectors = [
          '[data-u-comp="headerbar"]',
          '[data-u-comp="footer"]',
          '.univer-toolbar',
          '.univer-formula-bar',
          '.univer-sheet-bar',
          '.univer-footer',
          '.univer-statistic-bar',
        ];
        for (const sel of selectors) {
          try {
            root.querySelectorAll(sel).forEach((el) => {
              const node = el as HTMLElement;
              if (node.getAttribute('dir') !== want) node.setAttribute('dir', want);
              if (node.getAttribute('lang') !== lang) node.setAttribute('lang', lang);
              if (sel === '[data-u-comp="headerbar"]') headerFound = true;
            });
          } catch {}
        }
        // Headerbar gate (back-compat single query).
        try {
          const bar = root.querySelector('[data-u-comp="headerbar"]');
          if (bar) {
            headerFound = true;
            if ((bar as HTMLElement).getAttribute('dir') !== want) {
              (bar as HTMLElement).setAttribute('dir', want);
            }
            if ((bar as HTMLElement).getAttribute('lang') !== lang) {
              (bar as HTMLElement).setAttribute('lang', lang);
            }
          }
        } catch {}
        // Arabic-capable font on chrome (inherits into toolbar/formula-bar).
        try {
          if (rtl) {
            (root as HTMLElement).style.setProperty(
              '--univer-chrome-font',
              'Tahoma, "Segoe UI", Arial, sans-serif'
            );
          }
        } catch {}
        // Portal menus (context menu / toolbar dropdowns render under
        // document.body, outside root): stamp them too — event-driven only
        // (called from retries + contextmenu below), never a live observer.
        try {
          patchGlobalMenus(rtl);
        } catch {}
        return headerFound;
      } catch {
        return false;
      }
    };

    // Rebuild = full reboot from the freshest persisted snapshot.
    // Runs via the epoch state below (effect teardown disposes the old
    // Univer instance, effect body boots the new one) — identical to a
    // page reload, which is the one path guaranteed to show the new
    // direction / cleared values.
    const requestRebuild = () => {
      try {
        // Commit any in-progress cell edit into the workbook first so the
        // debounced save (now cancelled) doesn't silently drop it.
        try {
          const ae = document.activeElement as HTMLElement | null;
          if (ae && typeof ae.blur === 'function') ae.blur();
        } catch {}
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      } catch {}
      skipFlushRef.current = true;
      try {
        setLoadError(null);
        setLoading(true);
      } catch {}
      setEpoch((e) => e + 1);
    };

    const onRebuild = (e: Event) => {
      try {
        if ((e as CustomEvent)?.detail?.tableId !== tableId) return;
        requestRebuild();
      } catch {}
    };

    // Flush handshake: SmartTableView awaits this before direction
    // toggle / clear / repair so the last keystroke is persisted first.
    const onFlush = (e: Event) => {
      try {
        const detail = (e as CustomEvent)?.detail || {};
        if (detail.tableId !== tableId || !Array.isArray(detail.promises)) return;
        detail.promises.push(flushNowRef.current());
      } catch {}
    };

    const onTopCommand = (e: Event) => {
      try {
        const detail = (e as CustomEvent)?.detail || {};
        if (detail.tableId !== tableId) return;
        if (detail.command === 'delete-table') {
          void (async () => {
            const ok = await askConfirmRef.current(
              isArRef.current ? 'حذف هذا الجدول نهائيًا من التقرير وقاعدة البيانات؟ لا يمكن التراجع.' : 'Permanently delete this table from the report and database? This cannot be undone.'
            );
            if (!ok) return;
            try {
              // Cancel any pending debounced save first, then delete the entity
              // BEFORE removing the node — otherwise the unmount flush
              // re-saves the sheet and the values "come back".
              try {
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
              } catch {}
              const { deleteTableEntity } = await import('@/lib/db-intelligence');
              await deleteTableEntity(tableId);
              try {
                window.dispatchEvent(new CustomEvent('smart-table-deleted', { detail: { tableId } }));
              } catch {}
            } catch (err) {
              console.warn('Smart table entity delete failed (node still removed)', err);
            }
            onDeleteNode?.();
          })();
        } else if (detail.command === 'clear-values') {
          void (async () => {
            const ok = await askConfirmRef.current(
              isArRef.current ? 'مسح كل القيم داخل هذا الجدول؟ سيبقى الجدول فارغًا.' : 'Clear all values inside this table? The empty sheet stays.'
            );
            if (!ok) return;
            try {
              const { clearTableValues } = await import('@/lib/db-intelligence');
              await clearTableValues(tableId);
              // clearTableValues dispatches smart-table-rebuild which the
              // listener below turns into a live workbook rebuild.
            } catch (err) {
              console.warn('Clear table values failed', err);
            }
          })();
        } else if (detail.command === 'rename' && typeof detail.value === 'string') {
          const next = detail.value.slice(0, 120);
          const wb = runtimeRef.current?.workbook;
          try {
            wb?.getSheetBySheetId?.(UNIVER_SHEET_ID)?.setName(next || 'Sheet');
          } catch {}
          if (entityRef.current) {
            entityRef.current = { ...(entityRef.current as TableEntity), name: next } as TableEntity;
            setTableName(next);
            scheduleSave();
          }
        }
      } catch {}
    };

    // The mount node now always renders, but React may commit it after
    // this effect on the very first paint — retry instead of giving up
    // (giving up here was the permanent-blank-sheet bug: no host, no
    // error, no retry).
    const boot = (attempt: number) => {
      if (disposed || !mountedRef.current) return;
      const hostEl = hostRef.current;
      if (!hostEl) {
        if (attempt < 40) {
          window.setTimeout(() => boot(attempt + 1), 100);
          return;
        }
        console.error('UniverTable boot failed: mount node never appeared', { tableId });
        if (mountedRef.current) {
          setLoadError(
            isArRef.current
              ? 'تعذّر تركيب حاوية الجدول — حدّث الصفحة (F5).'
              : 'Could not mount the sheet container — reload the page (F5).'
          );
          setLoading(false);
        }
        return;
      }
      void init(hostEl);
    };

    const init = async (host: HTMLDivElement) => {
      try {
        const entity = (await getTableById(tableId)) as TableEntity | null;
        if (disposed || !mountedRef.current) return;
        if (!entity) {
          setLoadError(isArRef.current ? 'تعذّر تحميل الجدول.' : 'Could not load table.');
          setLoading(false);
          return;
        }
        entityRef.current = entity;
        setTableName(typeof (entity as any).name === 'string' ? (entity as any).name : '');

        // Lazy migration: pre-Univer tables get a snapshot on first open.
        let snapshot: any = (entity as any).univerSnapshot;
        if (needsUniverMigration(entity)) {
          snapshot = entityToUniverSnapshot(entity, { isAr: isArRef.current });
          try {
            const migrated = await saveTable({ ...(entity as TableEntity), univerSnapshot: snapshot });
            entityRef.current = migrated as TableEntity;
          } catch (err) {
            console.error('UniverTable migration save failed (continuing in-memory):', err);
          }
        }
        // RTL repair: snapshots migrated before RTL support (or saved while
        // the direction flag was lost) disagree with the entity direction —
        // heal them so Arabic sheets actually open right-to-left.
        try {
          const { repairTableDirection } = await import('@/lib/db-intelligence');
          const repaired = await repairTableDirection({
            ...(entityRef.current || entity),
            univerSnapshot: snapshot,
          } as TableEntity);
          if (repaired.fixed) {
            entityRef.current = repaired.record;
            snapshot = (repaired.record as any).univerSnapshot;
          }
        } catch {}
        // Guard: never hand Univer an empty/invalid workbook (blank screen)
        // or a structurally insane one (absurd dimensions / out-of-bounds
        // cells can hang the renderer and freeze the tab). Insane snapshots
        // fall back to a rebuild from the derived cache (values preserved),
        // not to an empty sheet.
        {
          const safe = sanitizeSnapshotForBoot(snapshot);
          if (safe) {
            snapshot = safe;
          } else {
            snapshot = entityToUniverSnapshot(entityRef.current || entity, { isAr: isArRef.current });
          }
        }
        // Split-brain healing: a rich body (`p`) rendering different text
        // than the canonical value (`v`) shows one thing and saves another.
        // Drop the divergent body so display follows `v`; no-op otherwise.
        try {
          const { normalizeDivergentRichText } = await import('@/lib/grid/univer-adapter');
          const healed = normalizeDivergentRichText(snapshot);
          if (healed.fixed > 0) {
            snapshot = healed.snapshot;
            try {
              console.log(`[rtl-frame] normalized ${healed.fixed} divergent rich cell(s) in table`, tableId);
            } catch {}
            try {
              const saved = await saveTable({ ...(entityRef.current || entity), univerSnapshot: snapshot } as TableEntity);
              entityRef.current = saved as TableEntity;
            } catch (err) {
              console.error('UniverTable rich-text healing save failed (continuing in-memory):', err);
            }
          }
        } catch {}
        try {
          lastSnapshotJsonRef.current = JSON.stringify(snapshot);
        } catch {
          lastSnapshotJsonRef.current = '';
        }

        // Fixed pixel mount: percentage heights inside flex chains resolve
        // to 0 in some layouts (blank white sheet, no error). Measure the
        // host and pin an explicit height; keep it synced on resize.
        container = document.createElement('div');
        const isFullScreenMode = mode === 'full-screen';
        const pinHeight = () => {
          try {
            const measured = host.clientHeight;
            const px = measured && measured > 200 ? measured : isFullScreenMode ? 600 : 480;
            container!.style.height = `${px}px`;
          } catch {}
        };
        container.style.width = '100%';
        container.style.minHeight = '0';
        // Arabic-capable font inside the sheet canvas UI (formula bar,
        // toolbar, cell editor) — harmless for English sheets, required
        // for Arabic glyphs to render correctly.
        try {
          container.style.fontFamily = 'Tahoma, "Segoe UI", Arial, sans-serif';
          const dirNow = getTableDirection(entityRef.current || entity);
          container.setAttribute('lang', dirNow === 'rtl' ? 'ar' : 'en');
        } catch {}
        host.appendChild(container);
        pinHeight();
        try {
          // Height pinning + RTL frame refresh: canvas resizes can reset
          // header-viewport scrolls upstream, so re-verify the RTL frame
          // here too (cheap signature check, writes only on drift).
          resizeObserver = new ResizeObserver(() => {
            pinHeight();
            try {
              const mod = rtlFrameRef.current;
              const ctx = rtlCtxRef.current;
              if (mod && ctx?.scene && ctx?.skeleton) {
                let hostWidth: number | undefined;
                try {
                  const w = host.clientWidth;
                  hostWidth = typeof w === 'number' && w > 0 ? w : undefined;
                } catch {}
                if (mod.ensureRtlFrameLayout(ctx.scene, ctx.skeleton, hostWidth) === 'applied') {
                  try {
                    window.dispatchEvent(new Event('resize'));
                  } catch {}
                }
              }
            } catch {}
          });
          resizeObserver.observe(host);
        } catch {}

        // Full spreadsheet chrome: ribbon toolbar + formula bar + sheet tabs
        // + context menu. The smart table IS a spreadsheet — nothing hidden.
        // UI locale follows the SHEET direction (RTL sheet → Arabic UI) with
        // the app language as fallback, so Arabic sheets always get an Arabic
        // sheet UI (menus, toolbar, formula bar) even when the app UI is
        // English — and Arabic cell input never depends on the UI locale.
        // If the Arabic bundle ever fails to boot, fall back to English
        // instead of a dead sheet — typing/data entry must never depend on
        // the UI locale.
        let tableDir: 'rtl' | 'ltr' = 'ltr';
        try {
          tableDir = getTableDirection(entityRef.current || entity);
        } catch {}
        const wantAr = tableDir === 'rtl' || isArRef.current;
        const buildUniver = (useAr: boolean) =>
          createUniver({
            locale: useAr ? LocaleType.AR_SA : LocaleType.EN_US,
            locales: {
              [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS as any),
              [LocaleType.AR_SA]: mergeLocales(UniverPresetSheetsCoreArSA as any),
            },
            presets: [
              UniverSheetsCorePreset({
                container: container as HTMLDivElement,
                header: true,
                toolbar: true,
                formulaBar: true,
                footer: { sheetBar: true, statisticBar: true, menus: true, zoomSlider: true },
                contextMenu: true,
                disableAutoFocus: true,
              }),
            ],
          });
        let created: any;
        try {
          created = buildUniver(wantAr);
        } catch (err) {
          console.error('UniverTable AR-locale boot failed, retrying with EN locale:', err);
          try {
            if (container) container.innerHTML = '';
          } catch {}
          created = buildUniver(false);
        }
        if (disposed) {
          try {
            created.univer.dispose();
          } catch {}
          return;
        }
        univer = created.univer;
        const univerAPI = created.univerAPI;
        const workbook = univerAPI.createWorkbook(snapshot);
        runtimeRef.current = { univer, univerAPI, workbook };
        // TEMPORARY diagnostic handles (remove after the reversed-cell fix):
        // the documented Facade API, so cell bytes can be inspected live
        // from the console (FWorkbook.getId, FRange.getValue/getDisplayValue/
        // getValues(true) — all verified in @univerjs/sheets facade).
        try {
          const w = window as any;
          w.univerAPI = univerAPI;
          w.univer = univer;
          console.log('[rtl-debug] univerAPI exposed for table', tableId);
        } catch {}

        // Chrome direction: mirror the FULL toolbar / formula-bar / footer
        // chrome (see patchChromeDir) for RTL sheets. It renders
        // asynchronously after createUniver, so retry a few times, then stop —
        // no persistent observer, zero steady-state cost (a subtree observer
        // here once froze the tab on open). Portal context menus render under
        // document.body on demand → re-stamp them on contextmenu (event-only).
        try {
          if (container) {
            const isRtlSheet = tableDir === 'rtl';
            const host: HTMLDivElement = container;
            // Always retry a few times: headerbar may exist before footer.
            let attempts = 0;
            const retry = () => {
              try {
                if (disposed || !mountedRef.current) return;
                patchChromeDir(host, isRtlSheet);
                attempts += 1;
                if (attempts < 6) chromeRetryTimer = setTimeout(retry, 500);
              } catch {}
            };
            patchChromeDir(host, isRtlSheet);
            chromeRetryTimer = setTimeout(retry, 500);
            try {
              const onCtxMenu = () => {
                try {
                  window.setTimeout(() => patchChromeDir(host, isRtlSheet), 0);
                } catch {}
              };
              container.addEventListener('contextmenu', onCtxMenu);
              // Removed with container on teardown (no separate cleanup map —
              // container.remove() drops its listeners).
            } catch {}
          }
        } catch {}

        // RTL grid frame (Excel-style: column A right, row numbers right).
        // Installs the engine patches once (module-idempotent, per-sheet
        // gated) then mirrors this sheet's viewport rects + scrolls to the
        // Excel-open position. The render scene boots asynchronously after
        // createWorkbook, so retry until it resolves, then stop.
        try {
          const isRtlSheet = tableDir === 'rtl';
          rtlCtxRef.current = null;
          if (isRtlSheet) {
            void (async () => {
              try {
                const mod = await import('@/lib/grid/univer-rtl-frame');
                if (disposed || !mountedRef.current) return;
                rtlFrameRef.current = mod;
                try {
                  await mod.installRtlFramePatches();
                } catch {}
                if (disposed || !mountedRef.current) return;
                let frameAttempts = 0;
                const applyFrame = async (): Promise<void> => {
                  const scheduleRetry = () => {
                    frameAttempts += 1;
                    if (frameAttempts >= 12) {
                      console.warn(
                        '[rtl-frame] RTL frame did not settle; grid patches stay active, frame may be unmirrored.',
                        { tableId }
                      );
                      return;
                    }
                    rtlLayoutTimerRef.current = setTimeout(() => {
                      void applyFrame();
                    }, 500);
                  };
                  const tryScrollStart = (): boolean => {
                    try {
                      const ctx = rtlCtxRef.current;
                      if (!ctx?.scene || !ctx?.skeleton) return false;
                      return mod.scrollRtlSheetToStart(ctx.scene, ctx.skeleton);
                    } catch {
                      return false;
                    }
                  };
                  try {
                    if (disposed || !mountedRef.current) return;
                    const ctx = await mod.getSheetRenderContext(univer, UNIVER_SHEET_ID);
                    if (ctx?.scene && ctx?.skeleton) {
                      rtlCtxRef.current = { scene: ctx.scene, skeleton: ctx.skeleton };
                      let hostWidth: number | undefined;
                      try {
                        const w = host.clientWidth;
                        hostWidth = typeof w === 'number' && w > 0 ? w : undefined;
                      } catch {}
                      const status = mod.ensureRtlFrameLayout(ctx.scene, ctx.skeleton, hostWidth);
                      if (status === 'applied') {
                        try {
                          window.dispatchEvent(new Event('resize'));
                        } catch {}
                      }
                      // Layout ('applied' now or 'ok' earlier) and the
                      // Excel-open scroll are independent: the viewport may
                      // lag the scene, so keep retrying until scroll lands.
                      if (status === 'not-ready' || !tryScrollStart()) {
                        scheduleRetry();
                      }
                    } else {
                      scheduleRetry();
                    }
                  } catch {}
                };
                void applyFrame();
              } catch {}
            })();
          }
        } catch {}

        try {
          univerAPI.onCommandExecuted(() => {
            scheduleSave();
            // RTL frame drift repair: freeze / header-resize operations
            // rewrite LTR viewport rects upstream; re-mirror when drifted.
            // Cheap signature check, writes only on drift, RTL sheets only.
            try {
              const mod = rtlFrameRef.current;
              const ctx = rtlCtxRef.current;
              if (mod && ctx?.scene && ctx?.skeleton) {
                let repaired = false;
                try {
                  repaired = mod.ensureRtlFrameLayout(ctx.scene, ctx.skeleton) === 'applied';
                } catch {}
                if (repaired) {
                  try {
                    window.dispatchEvent(new Event('resize'));
                  } catch {}
                }
              }
            } catch {}
          });
        } catch {}

        // Nudge the render engine (container measured post-append) and
        // verify something actually painted — never leave a silent blank.
        try {
          window.dispatchEvent(new Event('resize'));
        } catch {}
        if (mountedRef.current) setLoading(false);
        window.setTimeout(() => {
          try {
            if (disposed || !mountedRef.current) return;
            const painted =
              container?.querySelector('canvas') ||
              (container && container.childElementCount > 0 && container.textContent!.trim().length > 0);
            if (!painted) {
              console.error('UniverTable painted nothing into the mount container', {
                tableId,
                hostHeight: host.clientHeight,
                containerHeight: container?.clientHeight,
              });
              if (mountedRef.current) {
                setLoadError(
                  isArRef.current
                    ? 'محرك الجدول لم يرسم — حدّث الصفحة (F5)، وإن تكرر احذف الجدول وأدرج واحدًا جديدًا.'
                    : 'Sheet engine painted nothing — reload the page (F5); if it persists, delete and re-insert the table.'
                );
              }
            }
          } catch {}
        }, 2000);
      } catch (err) {
        console.error('UniverTable init failed:', err);
        if (mountedRef.current && !disposed) {
          const msg = err instanceof Error && err.message ? `: ${err.message}` : '';
          setLoadError(
            isArRef.current
              ? `تعذّر تهيئة محرر الجدول${msg} — احذف الجدول وأدرج واحدًا جديدًا.`
              : `Could not init table editor${msg} — delete the table and insert a new one.`
          );
          setLoading(false);
        }
      }
    };

    boot(0);

    // Command + rebuild listeners live at the component level — NOT inside
    // init — so toolbar delete/clear/direction keep working while the sheet
    // is still loading AND when it failed to load (the error card below
    // offers its own delete too). Never a dead table that can't be removed.
    try {
      window.addEventListener('smart-table-command', onTopCommand);
      window.addEventListener('smart-table-rebuild', onRebuild);
      window.addEventListener('smart-table-flush', onFlush);
    } catch {}

    return () => {
      disposed = true;
      // Rebuild reboots must NOT flush: the outgoing workbook still holds
      // the pre-rebuild state and would overwrite the fresh save
      // (toggle/clear would look like they "did nothing").
      const skipFlush = skipFlushRef.current;
      try {
        skipFlushRef.current = false;
      } catch {}
      if (!skipFlush) {
        // Never lose the last keystroke on fast navigation/unmount.
        try {
          flushPendingSaveRef.current();
        } catch {}
      }
      try {
        window.removeEventListener('smart-table-command', onTopCommand);
        window.removeEventListener('smart-table-rebuild', onRebuild);
        window.removeEventListener('smart-table-flush', onFlush);
      } catch {}
      try {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      } catch {}
      runtimeRef.current = null;
      rtlFrameRef.current = null;
      rtlCtxRef.current = null;
      try {
        resizeObserver?.disconnect();
      } catch {}
      try {
        if (chromeRetryTimer) clearTimeout(chromeRetryTimer);
      } catch {}
      chromeRetryTimer = null;
      try {
        if (rtlLayoutTimerRef.current) clearTimeout(rtlLayoutTimerRef.current);
      } catch {}
      rtlLayoutTimerRef.current = null;
      const u = univer;
      const c = container;
      queueMicrotask(() => {
        try {
          u?.dispose();
        } catch {}
        try {
          c?.remove();
        } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, epoch]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Delete from the error card: entity + node, no engine needed. This is
  // the escape hatch when the sheet failed to boot — the message used to
  // tell users to delete the table without offering any way to do it.
  const handleDeleteFromError = async () => {
    const ok = await askConfirm(
      isAr ? 'حذف هذا الجدول نهائيًا من التقرير؟' : 'Permanently delete this table from the report?'
    );
    if (!ok) return;
    try {
      const { deleteTableEntity } = await import('@/lib/db-intelligence');
      await deleteTableEntity(tableId);
      try {
        window.dispatchEvent(new CustomEvent('smart-table-deleted', { detail: { tableId } }));
      } catch {}
    } catch (err) {
      console.warn('Smart table entity delete failed (node still removed)', err);
    }
    onDeleteNode?.();
  };

  const grid = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Table management lives in the permanent node header above the sheet
          (SmartTableView) — the sheet itself shows only a save-failure chip
          and, on boot failure, an actionable error card with delete. */}
      {saveStatus === 'error' && (
        <button
          type="button"
          onClick={() => flushPendingSaveRef.current()}
          className="flex items-center justify-center gap-1.5 border-b border-destructive/40 bg-destructive/5 px-3 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10"
          title={isAr ? 'انقر لإعادة محاولة الحفظ' : 'Click to retry saving'}
        >
          <span>{isAr ? 'تعذّر حفظ الجدول — انقر لإعادة المحاولة' : 'Table save failed — click to retry'}</span>
        </button>
      )}
      {/* Univer mount point — ALWAYS mounted (even while loading) so the
          init effect never races a missing DOM node (was: blank sheet).
          dir stays ltr: the canvas engine assumes LTR DOM; sheet-level RTL
          comes from the snapshot rightToLeft flag (repaired on boot). */}
      <div
        className="relative min-h-0 flex-1"
        dir="ltr"
        onClickCapture={announceActive}
      >
        <div ref={hostRef} className="absolute inset-0 overflow-hidden" />
        {loading && (
          <div className="absolute inset-0 z-10 flex min-h-[300px] items-center justify-center bg-card">
            <PageLoading label={isAr ? 'جاري تحميل الجدول…' : 'Loading table…'} className="flex-col" spinnerClassName="size-6" />
          </div>
        )}
        {!loading && loadError && (
          <div className="absolute inset-0 z-10 overflow-auto bg-card">
            <div className="m-3 space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <p>{loadError}</p>
              <button
                type="button"
                onClick={() => void handleDeleteFromError()}
                className="rounded-md border border-red-300 bg-card px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40"
              >
                {isAr ? 'حذف هذا الجدول نهائيًا' : 'Delete this table permanently'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const body = grid;

  if (mode === 'full-screen') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background p-3 sm:p-5">
        <div className="mb-2 flex items-center gap-2">
          {onNavigateToContent && (
            <Button type="button" variant="outline" size="sm" onClick={onNavigateToContent} className="h-8 text-xs">
              {isAr ? 'عودة للمحتوى' : 'Back to content'}
            </Button>
          )}
          <div className="flex-1" />
          {onCloseFullScreen && (
            <Button type="button" variant="outline" size="sm" onClick={onCloseFullScreen} className="h-8 gap-1 text-xs">
              <X className="h-3.5 w-3.5" />
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          {body}
        </div>
        {confirmNode}
      </div>
    );
  }

  // Frameless in embedded mode: SmartTableView's node header owns the card
  // frame (name + direction + clear + delete), so the sheet docks under it
  // with no double border.
  return (
    <div className="flex h-[620px] min-h-0 flex-col overflow-hidden bg-card">
      {body}
      {confirmNode}
    </div>
  );
}
