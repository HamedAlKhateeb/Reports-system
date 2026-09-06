'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import {
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sliders,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Pencil,
  Copy,
  Check,
  CheckCheck,
  X,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { updateImageCaption, updateImageFileName, deleteReportImage, getReportImages } from '@/lib/db';
import { cn } from '@/lib/utils';

const ZOOM_PRESETS = [
  { label: '50%', value: 50 },
  { label: '75%', value: 75 },
  { label: '100%', value: 100 },
  { label: '150%', value: 150 },
  { label: '200%', value: 200 },
];

export function ReportImageView(props: NodeViewProps) {
  const { node, updateAttributes } = props;
  const {
    src,
    caption,
    sequenceNumber,
    fileName,
    reportId,
    imageId,
    alignment = 'center',
  } = node.attrs;

  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';
  const [showCustomSlider, setShowCustomSlider] = useState(false);

  // Image renaming & actions state
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Single source of truth for zoom percentage (default 100%)
  const zoomAttr = node.attrs.zoom || node.attrs.width || '100%';
  const currentZoom = typeof zoomAttr === 'number' ? zoomAttr : parseInt(zoomAttr, 10) || 100;
  const zoomScale = currentZoom / 100;

  // Natural image dimensions (in pixels)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(
    node.attrs.naturalWidth && node.attrs.naturalHeight
      ? { width: Number(node.attrs.naturalWidth), height: Number(node.attrs.naturalHeight) }
      : null
  );

  const imgRef = useRef<HTMLImageElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Measure and store natural dimensions from the <img> DOM element
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      setNaturalSize({ width: naturalWidth, height: naturalHeight });
      if (node.attrs.naturalWidth !== naturalWidth || node.attrs.naturalHeight !== naturalHeight) {
        updateAttributes({ naturalWidth, naturalHeight });
      }
    }
  };

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth) {
      const { naturalWidth, naturalHeight } = imgRef.current;
      setNaturalSize({ width: naturalWidth, height: naturalHeight });
      if (node.attrs.naturalWidth !== naturalWidth || node.attrs.naturalHeight !== naturalHeight) {
        updateAttributes({ naturalWidth, naturalHeight });
      }
    }
  }, [src, node.attrs.naturalWidth, node.attrs.naturalHeight, updateAttributes]);

  // Exact rendered dimensions derived directly from single source of truth
  const renderedWidth = naturalSize ? Math.round(naturalSize.width * zoomScale) : null;
  const renderedHeight = naturalSize ? Math.round(naturalSize.height * zoomScale) : null;

  // Frame width: sized to match rendered image + 2px borders, while respecting available viewport
  const frameWidth = renderedWidth !== null ? renderedWidth + 2 : undefined;

  const handleCaptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCaption = e.target.value;
    updateAttributes({ caption: newCaption });
    if (reportId && imageId) {
      updateImageCaption(reportId, imageId, newCaption).catch((err) => {
        console.error('Error updating caption in DB', err);
      });
    }
  };

  const handleSetZoom = useCallback(
    (newZoom: number) => {
      const clamped = Math.max(25, Math.min(400, Math.round(newZoom)));
      updateAttributes({
        zoom: `${clamped}%`,
        width: `${clamped}%`,
      });
    },
    [updateAttributes]
  );

  const handleZoomIn = () => {
    const next = Math.floor(currentZoom / 25) * 25 + 25;
    handleSetZoom(next);
  };

  const handleZoomOut = () => {
    const prev = Math.ceil(currentZoom / 25) * 25 - 25;
    handleSetZoom(prev);
  };

  const handleResetZoom = () => {
    handleSetZoom(100);
  };

  const handleSetAlignment = (newAlign: 'left' | 'center' | 'right') => {
    updateAttributes({ alignment: newAlign });
  };

  // Interactive Drag-to-Pan support when image exceeds viewport
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const canScrollX = container.scrollWidth > container.clientWidth;
    const canScrollY = container.scrollHeight > container.clientHeight;
    if (!canScrollX && !canScrollY) return;

    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !scrollContainerRef.current) return;
    e.preventDefault();
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    scrollContainerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
    scrollContainerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // --- Rename, Copy Path, and Delete Handlers ---
  const handleStartRename = () => {
    const currentFileName = fileName || `صورة-${sequenceNumber || 1}.png`;
    const dotIndex = currentFileName.lastIndexOf('.');
    const baseName = dotIndex > 0 ? currentFileName.substring(0, dotIndex) : currentFileName;
    setNameInput(baseName);
    setNameError(null);
    setIsEditingName(true);
    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 50);
  };

  const handleCancelRename = () => {
    setIsEditingName(false);
    setNameError(null);
  };

  const handleSaveRename = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError(isAr ? 'اسم الصورة لا يمكن أن يكون فارغاً' : 'Image name cannot be empty');
      return;
    }

    if (/[\\/:*?"<>|]/.test(trimmed)) {
      setNameError(
        isAr
          ? 'الاسم يحتوي على رموز غير مسموحة (\\ / : * ? " < > |)'
          : 'Name contains invalid characters (\\ / : * ? " < > |)'
      );
      return;
    }

    const currentFileName = fileName || `صورة-${sequenceNumber || 1}.png`;
    const extMatch = currentFileName.match(/\.([a-zA-Z0-9]+)$/);
    const defaultExt = extMatch ? `.${extMatch[1]}` : '.png';

    let finalName = trimmed;
    if (!/\.[a-zA-Z0-9]+$/.test(trimmed)) {
      finalName = `${trimmed}${defaultExt}`;
    }

    setIsSavingName(true);
    try {
      if (reportId) {
        const existingImages = await getReportImages(reportId);
        const duplicate = existingImages.find(
          (img) => img.id !== imageId && img.fileName.toLowerCase() === finalName.toLowerCase()
        );
        if (duplicate) {
          setNameError(
            isAr
              ? 'يوجد صورة أخرى بهذا الاسم بالفعل في هذا التقرير'
              : 'Another image with this name already exists in this report'
          );
          setIsSavingName(false);
          return;
        }
      }

      const newStoragePath = `reports/${reportId || 'default'}/images/${finalName}`;
      updateAttributes({
        fileName: finalName,
        storagePath: newStoragePath,
      });

      if (reportId && imageId) {
        await updateImageFileName(reportId, imageId, finalName);
      }

      setIsEditingName(false);
      setNameError(null);
    } catch (err) {
      console.error('Failed to update image fileName', err);
      setNameError(isAr ? 'حدث خطأ أثناء حفظ الاسم' : 'Error saving image name');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleCopyPath = async () => {
    const currentPath =
      node.attrs.storagePath ||
      `reports/${reportId || 'default'}/images/${fileName || `صورة-${sequenceNumber || 1}.png`}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentPath);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = currentPath;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      } catch (e) {
        console.error('Copy path failed', e);
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (reportId && imageId) {
      try {
        await deleteReportImage(reportId, imageId);
      } catch (err) {
        console.error('Failed to delete image from DB', err);
      }
    }
    props.deleteNode();
  };

  const alignmentClass =
    alignment === 'left'
      ? 'ms-0 me-auto'
      : alignment === 'right'
      ? 'ms-auto me-0'
      : 'mx-auto';

  return (
    <NodeViewWrapper dir={isAr ? 'rtl' : 'ltr'} className="my-6 block not-prose w-full max-w-full">
      <div
        style={{
          width: frameWidth ? `${frameWidth}px` : 'fit-content',
          maxWidth: '100%',
        }}
        className={cn(
          'group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:border-olive-500/50 hover:shadow-md',
          alignmentClass
        )}
      >
        {/* Top Bar: File Metadata, Actions, Zoom Controls, Presets & Alignment */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground min-w-0">
          {/* File Name & Actions */}
          <div className="flex items-center gap-1.5 min-w-0 max-w-full">
            {isEditingName ? (
              <div className="flex items-center gap-1 min-w-0">
                <input
                  ref={nameInputRef}
                  type="text"
                  dir={isAr ? 'rtl' : 'ltr'}
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    setNameError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename();
                    if (e.key === 'Escape') handleCancelRename();
                    e.stopPropagation();
                  }}
                  disabled={isSavingName}
                  className="h-7 w-40 sm:w-56 rounded-md border border-olive-600 bg-background px-2.5 py-1 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-olive-600 leading-normal"
                  placeholder={isAr ? 'اسم الصورة' : 'Image name'}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveRename}
                  disabled={isSavingName}
                  className="rounded p-1 text-emerald-600 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-40 transition-colors"
                  title={isAr ? 'حفظ الاسم' : 'Save name'}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelRename}
                  disabled={isSavingName}
                  className="rounded p-1 text-muted-foreground hover:bg-muted cursor-pointer transition-colors"
                  title={isAr ? 'إلغاء' : 'Cancel'}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <ImageIcon className="h-3.5 w-3.5 text-olive-600 dark:text-olive-400 shrink-0" />
                <span
                  className="font-mono text-[11px] font-semibold text-foreground truncate max-w-[110px] sm:max-w-[180px]"
                  title={fileName || `صورة-${sequenceNumber || 1}.png`}
                >
                  {fileName || `صورة-${sequenceNumber || 1}.png`}
                </span>
                {naturalSize && (
                  <span className="hidden sm:inline-block text-[10px] text-muted-foreground/80 font-normal shrink-0">
                    ({naturalSize.width}×{naturalSize.height}px)
                  </span>
                )}

                {/* Actions: Rename, Copy Path, Delete */}
                <div className="flex items-center gap-0.5 ms-1">
                  <button
                    type="button"
                    onClick={handleStartRename}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                    title={isAr ? 'تعديل اسم الصورة' : 'Rename image'}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyPath}
                    className={cn(
                      'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors cursor-pointer',
                      copyFeedback
                        ? 'bg-emerald-500/15 text-emerald-600 font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    title={isAr ? 'نسخ مسار الصورة' : 'Copy image path'}
                  >
                    {copyFeedback ? (
                      <>
                        <CheckCheck className="h-3 w-3" />
                        <span>{isAr ? 'تم النسخ' : 'Path copied'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span className="hidden sm:inline">{isAr ? 'نسخ المسار' : 'Copy path'}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600 transition-colors cursor-pointer"
                    title={isAr ? 'حذف الصورة' : 'Delete image'}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Controls: Zoom (-, Presets, +, Slider Toggle) and Alignment (R, C, L) */}
          <div className="flex flex-wrap items-center gap-1 shrink-0">
            {/* Zoom Stepper & Presets */}
            <div className="flex items-center rounded-lg border border-border/70 bg-background/80 p-0.5 shadow-2xs">
              {/* Zoom Out Button */}
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={currentZoom <= 25}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 transition-colors cursor-pointer"
                title={isAr ? 'تصغير (-25%)' : 'Zoom Out (-25%)'}
              >
                <ZoomOut className="h-3 w-3" />
              </button>

              {/* Presets */}
              <div className="flex items-center gap-0.5 overflow-x-auto">
                {ZOOM_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => handleSetZoom(p.value)}
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-colors cursor-pointer',
                      currentZoom === p.value
                        ? 'bg-[#2E4034] text-white shadow-2xs'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    title={`${isAr ? 'مستوى التكبير' : 'Zoom Level'}: ${p.label}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Zoom In Button */}
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={currentZoom >= 400}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 transition-colors cursor-pointer"
                title={isAr ? 'تكبير (+25%)' : 'Zoom In (+25%)'}
              >
                <ZoomIn className="h-3 w-3" />
              </button>

              {/* Fine Slider Toggle Button */}
              <button
                type="button"
                onClick={() => setShowCustomSlider(!showCustomSlider)}
                className={cn(
                  'rounded-md p-1 text-[10px] transition-colors cursor-pointer ml-0.5',
                  showCustomSlider
                    ? 'bg-[#2E4034]/15 text-[#2E4034] dark:bg-olive-950 dark:text-olive-200'
                    : 'text-muted-foreground hover:bg-muted'
                )}
                title={isAr ? 'شريط تحكم دقيق بالتكبير' : 'Fine Zoom Slider'}
              >
                <Sliders className="h-3 w-3" />
              </button>
            </div>

            {/* Alignment Controls */}
            <div className="flex items-center rounded-lg border border-border/70 bg-background/80 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => handleSetAlignment('right')}
                className={cn(
                  'rounded-md p-1 transition-colors cursor-pointer',
                  alignment === 'right'
                    ? 'bg-[#2E4034] text-white shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted'
                )}
                title={isAr ? 'محاذاة لليمين' : 'Align Right'}
              >
                <AlignRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleSetAlignment('center')}
                className={cn(
                  'rounded-md p-1 transition-colors cursor-pointer',
                  alignment === 'center'
                    ? 'bg-[#2E4034] text-white shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted'
                )}
                title={isAr ? 'محاذاة للوسط' : 'Align Center'}
              >
                <AlignCenter className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleSetAlignment('left')}
                className={cn(
                  'rounded-md p-1 transition-colors cursor-pointer',
                  alignment === 'left'
                    ? 'bg-[#2E4034] text-white shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted'
                )}
                title={isAr ? 'محاذاة لليسار' : 'Align Left'}
              >
                <AlignLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Name Validation Error Message */}
        {nameError && (
          <div className="flex items-center gap-1.5 border-b border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900/50 px-3 py-1.5 text-[11px] text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{nameError}</span>
          </div>
        )}

        {/* Delete Confirmation Banner */}
        {showDeleteConfirm && (
          <div className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50/95 dark:bg-red-950/70 dark:border-red-900/50 px-3 py-1.5 text-xs text-red-700 dark:text-red-300">
            <span className="font-medium">
              {isAr ? 'هل أنت متأكد من حذف هذه الصورة نهائياً؟' : 'Delete this image permanently?'}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer"
              >
                {isAr ? 'حذف' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {/* Optional Custom Fine-Zoom Slider Row */}
        {showCustomSlider && (
          <div className="flex items-center gap-3 border-b border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium shrink-0">{isAr ? 'التحكم الدقيق بالتكبير:' : 'Fine Zoom:'}</span>
            <input
              type="range"
              min="25"
              max="300"
              step="5"
              value={currentZoom}
              onChange={(e) => handleSetZoom(Number(e.target.value))}
              className="flex-1 accent-[#2E4034] h-1.5 rounded-lg cursor-pointer bg-muted"
            />
            <span className="font-mono font-bold text-foreground w-12 text-end shrink-0">
              {currentZoom}%
            </span>
            <button
              type="button"
              onClick={handleResetZoom}
              className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              title={isAr ? 'إعادة ضبط إلى 100%' : 'Reset to 100%'}
            >
              <RotateCcw className="h-2.5 w-2.5" />
              <span>100%</span>
            </button>
          </div>
        )}

        {/* Image Display / Viewport Area with Interactive Drag-to-Pan */}
        <div
          ref={scrollContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            maxHeight: '82vh',
          }}
          className={cn(
            'relative w-full overflow-auto bg-black/5 dark:bg-white/5 transition-colors',
            isPanning ? 'cursor-grabbing select-none' : 'cursor-default'
          )}
        >
          <div className="m-auto w-fit flex items-center justify-center p-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt={caption || fileName || 'Report screenshot'}
              onLoad={handleImageLoad}
              style={
                renderedWidth !== null && renderedHeight !== null
                  ? {
                      width: `${renderedWidth}px`,
                      minWidth: `${renderedWidth}px`,
                      height: `${renderedHeight}px`,
                      minHeight: `${renderedHeight}px`,
                    }
                  : undefined
              }
              className="block rounded-none transition-none pointer-events-auto select-none"
              draggable={false}
              loading="lazy"
            />
          </div>
        </div>

        {/* User-Editable Inline Caption */}
        <div className="border-t border-border bg-card/60 p-2.5 sm:p-3">
          <div className="relative flex items-center">
            <input
              type="text"
              dir={isAr ? 'rtl' : 'ltr'}
              value={caption || ''}
              onChange={handleCaptionChange}
              onKeyDown={(e) => e.stopPropagation()} // Prevent TipTap cursor interception
              placeholder={t('imageCaptionPlaceholder')}
              className="w-full rounded-lg border border-border/80 bg-background/90 ps-4 pe-4 py-2 sm:py-2.5 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-olive-600 focus:bg-background focus:outline-none focus:ring-1 focus:ring-olive-600 font-normal leading-normal"
            />
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
