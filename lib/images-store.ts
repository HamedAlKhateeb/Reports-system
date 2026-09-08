'use client';

import { useSyncExternalStore } from 'react';
import { ReportImage } from '@/lib/types';

export interface ImageState {
  imagesById: Record<string, ReportImage>;
}

const LOCAL_NORMALIZED_IMAGES_KEY = 'report_system_images_by_id';

class NormalizedImageStore {
  private state: ImageState = {
    imagesById: {},
  };
  private listeners: Set<() => void> = new Set();
  private isInitialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initFromStorage();
    }
  }

  private initFromStorage() {
    if (this.isInitialized) return;
    try {
      const raw = localStorage.getItem(LOCAL_NORMALIZED_IMAGES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.state = { imagesById: parsed };
        }
      }
    } catch (err) {
      console.warn('Failed to load normalized images from storage:', err);
    } finally {
      this.isInitialized = true;
    }
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_NORMALIZED_IMAGES_KEY, JSON.stringify(this.state.imagesById));
    } catch (err) {
      console.warn('Failed to persist normalized images to storage:', err);
    }
  }

  private notify() {
    this.persist();
    this.listeners.forEach((listener) => listener());
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): ImageState => {
    return this.state;
  };

  public getImage(id: string): ReportImage | undefined {
    return this.state.imagesById[id];
  }

  public getImagesByReportId(reportId: string): ReportImage[] {
    return Object.values(this.state.imagesById)
      .filter((img) => img.reportId === reportId)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }

  public upsertImage(image: ReportImage): void {
    this.state = {
      imagesById: {
        ...this.state.imagesById,
        [image.id]: image,
      },
    };
    this.notify();
  }

  public batchUpsertImages(images: ReportImage[]): void {
    if (!images.length) return;
    const nextMap = { ...this.state.imagesById };
    images.forEach((img) => {
      nextMap[img.id] = img;
    });
    this.state = { imagesById: nextMap };
    this.notify();
  }

  public removeImage(id: string): void {
    if (!this.state.imagesById[id]) return;
    const nextMap = { ...this.state.imagesById };
    delete nextMap[id];
    this.state = { imagesById: nextMap };
    this.notify();
  }

  public setReportImages(reportId: string, images: ReportImage[]): void {
    const nextMap = { ...this.state.imagesById };
    // Remove existing images for this report
    Object.keys(nextMap).forEach((key) => {
      if (nextMap[key].reportId === reportId) {
        delete nextMap[key];
      }
    });
    // Add new images
    images.forEach((img) => {
      nextMap[img.id] = img;
    });
    this.state = { imagesById: nextMap };
    this.notify();
  }
}

export const imageStore = new NormalizedImageStore();

/**
 * React hook to reactively subscribe to all images in a report from the normalized store
 */
export function useReportImages(reportId?: string): ReportImage[] {
  const state = useSyncExternalStore(
    imageStore.subscribe,
    imageStore.getSnapshot,
    () => ({ imagesById: {} })
  );

  const allImages: ReportImage[] = Object.values(state.imagesById);

  if (!reportId) {
    return allImages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }

  return allImages
    .filter((img) => img.reportId === reportId)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/**
 * React hook to get access to the raw normalized state
 */
export function useImageStore(): ImageState {
  return useSyncExternalStore(
    imageStore.subscribe,
    imageStore.getSnapshot,
    () => ({ imagesById: {} })
  );
}
