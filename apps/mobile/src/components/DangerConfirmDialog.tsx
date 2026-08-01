import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'

type DangerConfirmDialogProps = {
  readonly open: boolean
  readonly title: string
  readonly message: ReactNode
  /** Label of the destructive action, e.g. "Löschen" or "Entfernen". */
  readonly confirmLabel: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/**
 * The confirm-before-destroying dialog every remove/delete flow shows:
 * title, consequence text, Abbrechen, and one destructive action.
 */
export function DangerConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: DangerConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nowOpen) => {
        if (!nowOpen) onCancel()
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
