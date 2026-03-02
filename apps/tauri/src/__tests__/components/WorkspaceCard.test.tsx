import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { WorkspaceCard } from '@/components/WorkspaceCard';
import type { Workspace } from '@/types';

describe('WorkspaceCard', () => {
  const mockWorkspace: Workspace = {
    id: '1',
    type: 'file',
    path: '/path/to/file.md',
    displayName: 'file.md',
    lastAccessed: new Date('2024-01-01T12:00:00'),
  };

  it('renders workspace information', () => {
    const onExpand = vi.fn();
    const onClose = vi.fn();

    render(
      <WorkspaceCard
        workspace={mockWorkspace}
        onExpand={onExpand}
        onClose={onClose}
      />
    );

    expect(screen.getByText('file.md')).toBeInTheDocument();
    expect(screen.getByText('/path/to/file.md')).toBeInTheDocument();
  });

  it('calls onExpand when card is clicked', async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    const onClose = vi.fn();

    render(
      <main>
        <WorkspaceCard
          workspace={mockWorkspace}
          onExpand={onExpand}
          onClose={onClose}
        />
      </main>
    );

    const card = screen.getByText('file.md').closest('div[class*="group"]');
    if (card) {
      await user.click(card);
      expect(onExpand).toHaveBeenCalledWith('1', expect.objectContaining({
        top: expect.any(Number),
        left: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      }));
    }
  });

  it('calls onClose when close button is clicked and confirmed', async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    const onClose = vi.fn();

    render(
      <WorkspaceCard
        workspace={mockWorkspace}
        onExpand={onExpand}
        onClose={onClose}
      />
    );

    const closeButton = screen.getByRole('button');
    await user.click(closeButton);

    const confirmButton = await screen.findByRole('button', { name: 'Fechar' });
    await user.click(confirmButton);

    expect(onClose).toHaveBeenCalledWith('1');
    expect(onExpand).not.toHaveBeenCalled();
  });

  it('prevents card expansion when close button is clicked', async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    const onClose = vi.fn();

    render(
      <WorkspaceCard
        workspace={mockWorkspace}
        onExpand={onExpand}
        onClose={onClose}
      />
    );

    const closeButton = screen.getByRole('button');
    await user.click(closeButton);

    expect(onExpand).not.toHaveBeenCalled();
  });
});
