import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({ className, ...props }: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle>) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      "group relative flex w-3 -mx-1.5 z-10 items-center justify-center bg-transparent data-[panel-group-direction=vertical]:h-3 data-[panel-group-direction=vertical]:-my-1.5 data-[panel-group-direction=vertical]:mx-0 data-[panel-group-direction=vertical]:w-full focus-visible:outline-none [&[data-panel-group-direction=vertical]>div]:rotate-90",
      className,
    )}
    {...props}
  >
    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />
    <div className="relative h-8 w-px rounded-full bg-muted-foreground/40 shadow-[0_0_0_1.5px] shadow-muted-foreground/30 transition-all group-hover:shadow-muted-foreground/50 group-hover:bg-muted-foreground/60 group-active:shadow-muted-foreground/70 group-active:bg-muted-foreground/80" />
  </ResizablePrimitive.PanelResizeHandle>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
