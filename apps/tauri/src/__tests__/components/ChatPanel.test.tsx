import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ChatPanel } from '@/components/ChatPanel';
import type { Message } from '@/types';

const mockMessages: Message[] = [
  {
    id: '1',
    sessionId: 's1',
    role: 'user',
    content: 'Hello, how are you?',
    timestamp: new Date('2024-01-15T10:30:00'),
  },
  {
    id: '2',
    sessionId: 's1',
    role: 'assistant',
    content: 'I am doing well, thank you!',
    timestamp: new Date('2024-01-15T10:31:00'),
  },
  {
    id: '3',
    sessionId: 's1',
    role: 'assistant',
    type: 'thinking',
    content: 'Let me think about this...',
    timestamp: new Date('2024-01-15T10:32:00'),
  },
];

describe('ChatPanel', () => {
  it('renders empty state when no messages', () => {
    render(<ChatPanel messages={[]} />);
    expect(screen.getByText('Inicie uma conversa')).toBeInTheDocument();
  });

  it('renders list of messages', () => {
    render(<ChatPanel messages={mockMessages} />);

    expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
    expect(screen.getByText('I am doing well, thank you!')).toBeInTheDocument();
    expect(screen.getByText('Let me think about this...')).toBeInTheDocument();
  });

  it('displays different message types with correct styling', () => {
    render(<ChatPanel messages={mockMessages} />);

    const userMessage = screen.getByText('Hello, how are you?').closest('div');
    expect(userMessage).toHaveClass('bg-primary');

    const assistantMessage = screen.getByText('I am doing well, thank you!').closest('div');
    expect(assistantMessage).toHaveClass('bg-muted');

    const thinkingMessage = screen.getByText('Let me think about this...').closest('div');
    expect(thinkingMessage).toHaveClass('bg-muted/50');
  });

  it('shows role labels for messages', () => {
    render(<ChatPanel messages={mockMessages} />);

    const youLabels = screen.getAllByText('Você');
    expect(youLabels).toHaveLength(1);

    const assistantLabels = screen.getAllByText('Assistente');
    expect(assistantLabels).toHaveLength(2);
  });

  it('calls onSendMessage when sending a message', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();

    render(<ChatPanel messages={[]} onSendMessage={onSendMessage} />);

    const textarea = screen.getByPlaceholderText(/Digite uma mensagem/i);
    await user.type(textarea, 'Test message');
    await user.click(screen.getByRole('button'));

    expect(onSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('clears input after sending message', async () => {
    const user = userEvent.setup();

    render(<ChatPanel messages={[]} onSendMessage={vi.fn()} />);

    const textarea = screen.getByPlaceholderText(/Digite uma mensagem/i) as HTMLTextAreaElement;
    await user.type(textarea, 'Test message');
    await user.click(screen.getByRole('button'));

    expect(textarea.value).toBe('');
  });

  it('sends message on Enter key', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();

    render(<ChatPanel messages={[]} onSendMessage={onSendMessage} />);

    const textarea = screen.getByPlaceholderText(/Digite uma mensagem/i);
    await user.type(textarea, 'Test message{Enter}');

    expect(onSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('does not send empty messages', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();

    render(<ChatPanel messages={[]} onSendMessage={onSendMessage} />);

    await user.click(screen.getByRole('button'));

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('disables send button when input is empty', () => {
    render(<ChatPanel messages={[]} />);

    const sendButton = screen.getByRole('button');
    expect(sendButton).toBeDisabled();
  });
});
