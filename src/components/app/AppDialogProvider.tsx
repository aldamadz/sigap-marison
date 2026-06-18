import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
};

type PromptOptions = {
  title: string;
  description?: ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  multiline?: boolean;
  required?: boolean;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

type PendingPrompt = PromptOptions & {
  resolve: (value: string | null) => void;
};

type AppDialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<PendingConfirm | null>(null);
  const [promptState, setPromptState] = useState<PendingPrompt | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const closeConfirm = useCallback((value: boolean) => {
    setConfirmState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const closePrompt = useCallback((value: string | null) => {
    setPromptState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => (
    new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve }))
  ), []);

  const prompt = useCallback((options: PromptOptions) => (
    new Promise<string | null>((resolve) => {
      setPromptValue(options.defaultValue ?? "");
      setPromptState({ ...options, resolve });
    })
  ), []);

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);
  const promptIsInvalid = promptState?.required === true && !promptValue.trim();

  return (
    <AppDialogContext.Provider value={value}>
      {children}

      <AlertDialog open={!!confirmState} onOpenChange={(open) => { if (!open) closeConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            {confirmState?.description && (
              <AlertDialogDescription asChild>
                <div>{confirmState.description}</div>
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => closeConfirm(false)}>
              {confirmState?.cancelText || "Batal"}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                confirmState?.variant === "destructive" &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
              onClick={(event) => {
                event.preventDefault();
                closeConfirm(true);
              }}
            >
              {confirmState?.confirmText || "Lanjutkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!promptState} onOpenChange={(open) => { if (!open) closePrompt(null); }}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (promptIsInvalid) return;
              closePrompt(promptValue.trim());
            }}
          >
            <DialogHeader>
              <DialogTitle>{promptState?.title}</DialogTitle>
              {promptState?.description && (
                <DialogDescription asChild>
                  <div>{promptState.description}</div>
                </DialogDescription>
              )}
            </DialogHeader>
            <div className="py-4">
              {promptState?.label && (
                <Label className="mb-2 block text-xs font-bold uppercase text-muted-foreground">
                  {promptState.label}
                </Label>
              )}
              {promptState?.multiline ? (
                <Textarea
                  autoFocus
                  value={promptValue}
                  placeholder={promptState.placeholder}
                  onChange={(event) => setPromptValue(event.target.value)}
                  className="min-h-28"
                />
              ) : (
                <Input
                  autoFocus
                  value={promptValue}
                  placeholder={promptState?.placeholder}
                  onChange={(event) => setPromptValue(event.target.value)}
                />
              )}
              {promptIsInvalid && (
                <p className="mt-2 text-xs font-medium text-destructive">Field ini wajib diisi.</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closePrompt(null)}>
                {promptState?.cancelText || "Batal"}
              </Button>
              <Button type="submit" disabled={promptIsInvalid}>
                {promptState?.confirmText || "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error("useAppDialog must be used inside AppDialogProvider");
  return context;
}
