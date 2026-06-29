import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

type DialogMotion = "default" | "docs";

interface DialogOverlayProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> {
  motion?: DialogMotion;
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  DialogOverlayProps
>(({ className, motion = "default", ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]",
      motion === "default" && "app-dialog-overlay",
      motion === "docs" && "docs-dialog-overlay",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  motion?: DialogMotion;
  overlayClassName?: string;
  accessibilityTitle?: string;
  accessibilityDescription?: string;
}

const hasDialogSemanticChild = (children: React.ReactNode, displayName: string): boolean =>
  React.Children.toArray(children).some((child) => {
    if (!React.isValidElement(child)) return false;
    const type = child.type as { displayName?: string };
    if (type.displayName === displayName) return true;
    const nestedChildren = (child.props as { children?: React.ReactNode }).children;
    return nestedChildren ? hasDialogSemanticChild(nestedChildren, displayName) : false;
  });

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({
  className,
  children,
  motion = "default",
  overlayClassName,
  accessibilityTitle = "Dialog",
  accessibilityDescription = "Jendela dialog SIGAP.",
  ...props
}, ref) => {
  const hasTitle = hasDialogSemanticChild(children, DialogPrimitive.Title.displayName);
  const hasDescription = hasDialogSemanticChild(children, DialogPrimitive.Description.displayName);

  return (
    <DialogPortal>
      <DialogOverlay motion={motion} className={overlayClassName} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-lg gap-4 overflow-y-auto border bg-background p-4 shadow-[var(--shadow-elevated)]",
          motion === "default" && "app-dialog-content",
          motion === "docs" && "docs-dialog-content",
          className,
        )}
        {...props}
      >
        {!hasTitle && (
          <DialogPrimitive.Title className="sr-only">
            {accessibilityTitle}
          </DialogPrimitive.Title>
        )}
        {!hasDescription && (
          <DialogPrimitive.Description className="sr-only">
            {accessibilityDescription}
          </DialogPrimitive.Description>
        )}
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground opacity-80 ring-offset-background transition-colors data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:bg-accent hover:text-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-semibold leading-snug tracking-tight sm:text-lg", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
