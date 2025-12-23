import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

const DEFAULT_SIDE_PANEL_WIDTH = 500;
const MIN_SIDE_PANEL_WIDTH = 450;
const MAX_SIDE_PANEL_WIDTH = 600;

interface UIState {
  sidebarOpen: boolean;
  sidePanelOpen: boolean;
  sidePanelWidth: number;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidePanelOpen: (open: boolean) => void;
  toggleSidePanel: () => void;
  setSidePanelWidth: (width: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidePanelOpen: false,
      sidePanelWidth: DEFAULT_SIDE_PANEL_WIDTH,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidePanelOpen: (open) => set({ sidePanelOpen: open }),
      toggleSidePanel: () =>
        set((state) => ({ sidePanelOpen: !state.sidePanelOpen })),
      setSidePanelWidth: (width) =>
        set({
          sidePanelWidth: Math.min(
            Math.max(width, MIN_SIDE_PANEL_WIDTH),
            MAX_SIDE_PANEL_WIDTH,
          ),
        }),
    }),
    {
      name: "ui-storage",
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        sidePanelOpen: state.sidePanelOpen,
        sidePanelWidth: state.sidePanelWidth,
      }),
    },
  ),
);

export { MIN_SIDE_PANEL_WIDTH, MAX_SIDE_PANEL_WIDTH, DEFAULT_SIDE_PANEL_WIDTH };

/** Selector for sidebar state only - prevents re-renders when other state changes */
export const useSidebarState = () =>
  useUIStore(
    useShallow((state) => ({
      sidebarOpen: state.sidebarOpen,
      setSidebarOpen: state.setSidebarOpen,
      toggleSidebar: state.toggleSidebar,
    })),
  );

/** Selector for side panel state only - prevents re-renders when other state changes */
export const useSidePanelState = () =>
  useUIStore(
    useShallow((state) => ({
      sidePanelOpen: state.sidePanelOpen,
      sidePanelWidth: state.sidePanelWidth,
      setSidePanelOpen: state.setSidePanelOpen,
      toggleSidePanel: state.toggleSidePanel,
      setSidePanelWidth: state.setSidePanelWidth,
    })),
  );

export const useSidebarOpen = () => useUIStore((state) => state.sidebarOpen);
export const useSidePanelOpen = () =>
  useUIStore((state) => state.sidePanelOpen);
export const useSidePanelWidth = () =>
  useUIStore((state) => state.sidePanelWidth);
