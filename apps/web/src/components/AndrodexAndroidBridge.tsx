import { useEffect } from "react";
import { useSidebar } from "./ui/sidebar";
import {
  ANDRODEX_ANDROID_BRIDGE_VERSION,
  createAndrodexAndroidBridge,
  documentHasAndrodexActiveThread,
} from "../lib/androdexAndroidBridge";

export function AndrodexAndroidBridge() {
  const { isMobile, open, openMobile, setOpen, setOpenMobile, toggleSidebar } = useSidebar();

  useEffect(() => {
    const bridge = createAndrodexAndroidBridge({
      isMobile,
      open,
      openMobile,
      readHasActiveThread: () => documentHasAndrodexActiveThread(document),
      setOpen,
      setOpenMobile,
      toggleSidebar,
    });

    window.__androdexAndroidBridge = bridge;
    document.body.dataset.androdexAndroidBridge = `v${ANDRODEX_ANDROID_BRIDGE_VERSION}`;
    document.documentElement.dataset.androdexAndroidBridge = `v${ANDRODEX_ANDROID_BRIDGE_VERSION}`;

    return () => {
      if (window.__androdexAndroidBridge === bridge) {
        delete window.__androdexAndroidBridge;
      }
      delete document.body.dataset.androdexAndroidBridge;
      delete document.documentElement.dataset.androdexAndroidBridge;
    };
  }, [isMobile, open, openMobile, setOpen, setOpenMobile, toggleSidebar]);

  return null;
}
