export const ANDRODEX_ANDROID_BRIDGE_VERSION = 1;
export const ANDRODEX_ACTIVE_THREAD_SELECTOR = "[data-androdex-active-thread]";

export interface AndrodexAndroidBridgeState {
  readonly version: typeof ANDRODEX_ANDROID_BRIDGE_VERSION;
  readonly hasActiveThread: boolean;
  readonly isSidebarOpen: boolean;
  readonly isMobile: boolean;
}

export interface AndrodexAndroidBridgeContract {
  readonly version: typeof ANDRODEX_ANDROID_BRIDGE_VERSION;
  getState: () => AndrodexAndroidBridgeState;
  hasActiveThread: () => boolean;
  isSidebarOpen: () => boolean;
  openSidebar: () => boolean;
  closeSidebar: () => boolean;
  toggleSidebar: () => boolean;
}

export interface AndrodexAndroidBridgeControls {
  readonly isMobile: boolean;
  readonly open: boolean;
  readonly openMobile: boolean;
  readonly readHasActiveThread: () => boolean;
  readonly setOpen: (open: boolean) => void;
  readonly setOpenMobile: (open: boolean) => void;
  readonly toggleSidebar: () => void;
}

declare global {
  interface Window {
    __androdexAndroidBridge?: AndrodexAndroidBridgeContract;
  }
}

interface AndrodexActiveThreadMarker {
  readonly dataset?: {
    readonly androdexActiveThread?: string;
  };
}

export function documentHasAndrodexActiveThread(doc: Pick<Document, "querySelector">): boolean {
  const marker = doc.querySelector(ANDRODEX_ACTIVE_THREAD_SELECTOR);
  if (!marker || typeof marker !== "object" || !("dataset" in marker)) {
    return false;
  }

  const dataset = (marker as AndrodexActiveThreadMarker).dataset;
  if (!dataset || typeof dataset !== "object") {
    return false;
  }

  return dataset.androdexActiveThread === "true";
}

export function createAndrodexAndroidBridge(
  controls: AndrodexAndroidBridgeControls,
): AndrodexAndroidBridgeContract {
  const readSidebarOpen = () => (controls.isMobile ? controls.openMobile : controls.open);
  const readState = (): AndrodexAndroidBridgeState => ({
    version: ANDRODEX_ANDROID_BRIDGE_VERSION,
    hasActiveThread: controls.readHasActiveThread(),
    isSidebarOpen: readSidebarOpen(),
    isMobile: controls.isMobile,
  });

  return {
    version: ANDRODEX_ANDROID_BRIDGE_VERSION,
    getState: readState,
    hasActiveThread: () => readState().hasActiveThread,
    isSidebarOpen: () => readState().isSidebarOpen,
    openSidebar: () => {
      if (controls.isMobile) {
        if (!controls.openMobile) {
          controls.setOpenMobile(true);
        }
        return true;
      }

      if (!controls.open) {
        controls.setOpen(true);
      }
      return true;
    },
    closeSidebar: () => {
      if (!readSidebarOpen()) {
        return false;
      }

      if (controls.isMobile) {
        controls.setOpenMobile(false);
      } else {
        controls.setOpen(false);
      }
      return true;
    },
    toggleSidebar: () => {
      controls.toggleSidebar();
      return true;
    },
  };
}
