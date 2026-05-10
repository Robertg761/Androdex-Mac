import { vi } from "vitest";

const browserWindows: MockBrowserWindow[] = [];

class MockBrowserWindow {
  static getAllWindows = vi.fn(() => browserWindows);
  static getFocusedWindow = vi.fn(() => null);

  readonly webContents = {
    on: vi.fn(),
    send: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    session: {
      webRequest: {
        onHeadersReceived: vi.fn(),
      },
    },
  };

  constructor(readonly options: Record<string, unknown> = {}) {
    browserWindows.push(this);
  }

  close = vi.fn();
  destroy = vi.fn(() => {
    const index = browserWindows.indexOf(this);
    if (index >= 0) {
      browserWindows.splice(index, 1);
    }
  });
  focus = vi.fn();
  isDestroyed = vi.fn(() => false);
  isMinimized = vi.fn(() => false);
  isVisible = vi.fn(() => true);
  loadURL = vi.fn(() => Promise.resolve());
  maximize = vi.fn();
  on = vi.fn();
  once = vi.fn();
  removeListener = vi.fn();
  restore = vi.fn();
  setBackgroundColor = vi.fn();
  setMenu = vi.fn();
  show = vi.fn();
}

vi.mock("electron", () => ({
  app: {
    commandLine: {
      appendSwitch: vi.fn(),
    },
    dock: {
      setIcon: vi.fn(),
    },
    exit: vi.fn(),
    focus: vi.fn(),
    getAppPath: vi.fn(() => process.cwd()),
    getPath: vi.fn(() => process.cwd()),
    getVersion: vi.fn(() => "0.0.0-test"),
    isPackaged: false,
    name: "Androdex",
    on: vi.fn(),
    quit: vi.fn(),
    relaunch: vi.fn(),
    removeListener: vi.fn(),
    runningUnderARM64Translation: false,
    setAboutPanelOptions: vi.fn(),
    setAppUserModelId: vi.fn(),
    setDesktopName: vi.fn(),
    setName: vi.fn(),
    setPath: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  BrowserWindow: MockBrowserWindow,
  Menu: {
    buildFromTemplate: vi.fn((template) => ({
      popup: vi.fn(),
      template,
    })),
    setApplicationMenu: vi.fn(),
  },
  clipboard: {
    writeText: vi.fn(),
  },
  dialog: {
    showErrorBox: vi.fn(),
    showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
    showOpenDialog: vi.fn(() => Promise.resolve({ canceled: true, filePaths: [] })),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
  },
  nativeTheme: {
    on: vi.fn(),
    removeListener: vi.fn(),
    shouldUseDarkColors: false,
    themeSource: "system",
  },
  protocol: {
    registerFileProtocol: vi.fn(() => true),
    registerSchemesAsPrivileged: vi.fn(),
    unregisterProtocol: vi.fn(),
  },
  safeStorage: {
    decryptString: vi.fn((value: Buffer) => value.toString("utf8")),
    encryptString: vi.fn((value: string) => Buffer.from(value, "utf8")),
    isEncryptionAvailable: vi.fn(() => true),
  },
  shell: {
    openExternal: vi.fn(() => Promise.resolve()),
  },
}));
