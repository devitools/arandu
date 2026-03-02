import { MessageSquare, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Trans, useTranslation } from 'react-i18next';
import type { Workspace, CardRect } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { getDateLocale } from '@/lib/date-locale';
import { shortenPath } from '@/lib/format-path';

interface WorkspaceCardProps {
  workspace: Workspace;
  unresolvedComments?: number;
  onExpand: (id: string, rect?: CardRect) => void;
  onClose: (id: string) => void;
}

export function WorkspaceCard({ workspace, unresolvedComments, onExpand, onClose }: WorkspaceCardProps) {
  const { t, i18n } = useTranslation();

  const prefix = workspace.type === 'directory' ? 'workspace' : 'document';

  return (
    <Card
      data-workspace-id={workspace.id}
      className="group relative px-3.5 py-3 cursor-pointer hover:bg-accent/50 transition-colors duration-150"
      onClick={(e) => {
        const cardEl = e.currentTarget;
        const mainEl = cardEl.closest('main');
        if (!mainEl) {
          onExpand(workspace.id);
          return;
        }
        const cardVp = cardEl.getBoundingClientRect();
        const mainVp = mainEl.getBoundingClientRect();
        onExpand(workspace.id, {
          top: cardVp.top - mainVp.top,
          left: cardVp.left - mainVp.left,
          width: cardVp.width,
          height: cardVp.height,
        });
      }}
    >
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${prefix}.closeTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                i18nKey={`${prefix}.closeDescription`}
                values={{ name: workspace.displayName }}
                components={{ strong: <strong /> }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => onClose(workspace.id)}>
              {t("common.close")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {unresolvedComments != null && unresolvedComments > 0 && (
        <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 text-muted-foreground group-hover:opacity-0 transition-opacity">
          <MessageSquare className="h-3 w-3" />
          <span className="font-semibold text-[10px]">{unresolvedComments}</span>
        </span>
      )}

      <h3 className="font-semibold text-sm truncate pr-6">{workspace.displayName}</h3>
      <p className="text-xs text-muted-foreground truncate mt-1" dir="rtl" title={workspace.path}>
        <bdi>{shortenPath(workspace.path)}</bdi>
      </p>
      <div className="text-[11px] text-muted-foreground mt-2 text-right">
        {formatDistanceToNow(new Date(workspace.lastAccessed), { addSuffix: true, locale: getDateLocale(i18n.language) })}
      </div>
    </Card>
  );
}
