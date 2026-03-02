import { useApp } from '@/contexts/AppContext';

export function StatusBar() {
  const { workspaces, expandedWorkspaceId } = useApp();

  const expandedWorkspace = workspaces.find((w) => w.id === expandedWorkspaceId);

  return (
    <div className="h-6 border-t border-border bg-muted px-3 flex items-center justify-between text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        {expandedWorkspace ? (
          <span className="truncate max-w-md">{expandedWorkspace.path}</span>
        ) : (
          <span>{workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span>Arandu v0.2.0</span>
      </div>
    </div>
  );
}
