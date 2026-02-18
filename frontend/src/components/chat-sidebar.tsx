// ==========================================================================
// ChatSidebar Component - Agentic RAG Chatbot
// Integrated sidebar chat for natural language queries against case database
// Uses Azure OpenAI GPT-4o for embeddings & RAG-based responses
// ==========================================================================
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '@/lib/api';
import type { ChatMessage } from '@/types/case';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import {
  X,
  Send,
  Loader2,
  MessageSquare,
  Bot,
  User,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

interface ChatSidebarProps {
  onClose: () => void;
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export function ChatSidebar({ onClose }: ChatSidebarProps) {
  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'system-welcome',
      role: 'assistant',
      content:
        'Hello! I\'m your AI assistant for the War Room Case Taxonomy Portal. I can help you:\n\n' +
        '- **Query case data** (e.g., "How many cases are idle > 8 hours?")\n' +
        '- **Summarize patterns** (e.g., "What are common blockers for PG-related cases?")\n' +
        '- **Find specific cases** (e.g., "Show me all Break fix cases assigned to Customer")\n' +
        '- **Analyze trends** (e.g., "Which resolution sources are most common?")\n\n' +
        'Ask me anything about your case data!',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId] = useState(() => `conv-${Date.now()}`);

  // Auto-scroll ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --------------------------------------------------------------------------
  // Auto-scroll to bottom on new messages
  // --------------------------------------------------------------------------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --------------------------------------------------------------------------
  // Send message handler
  // --------------------------------------------------------------------------
  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || sending) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setSending(true);

    try {
      // Send to Azure Functions -> Azure OpenAI GPT-4o RAG pipeline
      const response = await sendChatMessage({
        message: trimmed,
        conversationId,
      });

      if (response.success && response.data) {
        setMessages((prev) => [...prev, response.data!]);
      } else {
        // Handle API-level error
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: response.error || 'Sorry, I encountered an error processing your request. Please try again.',
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error: any) {
      // Handle network/timeout errors with retry guidance
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `I'm having trouble connecting to the AI service. ${
          error?.message || 'Please check your connection and try again.'
        }`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      console.error('[ChatSidebar] Send error:', error);
    } finally {
      setSending(false);
    }
  };

  // Handle Enter key to send
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // --------------------------------------------------------------------------
  // Example queries for quick selection
  // --------------------------------------------------------------------------
  const exampleQueries = [
    'Summarize common blockers for PG-related cases',
    'How many cases are idle > 8 hours?',
    'What are the top issue types this week?',
    'Show me unreviewed cases with high complexity',
  ];

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <aside className="fixed right-0 top-0 h-screen w-[400px] border-l bg-background shadow-lg z-40 flex flex-col">
      {/* ================================================================== */}
      {/* Header */}
      {/* ================================================================== */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">AI Assistant</h2>
          <Badge variant="secondary" className="text-xs">GPT-4o</Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* ================================================================== */}
      {/* Messages Area */}
      {/* ================================================================== */}
      <div className="flex-1 overflow-y-auto chat-scrollbar p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {/* Assistant avatar */}
            {msg.role === 'assistant' && (
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}

            {/* Message bubble */}
            <div
              className={`max-w-[300px] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              {/* Render markdown-like content for assistant messages */}
              <div className="whitespace-pre-wrap break-words">
                {msg.content.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {line.startsWith('- **') ? (
                      <p className="ml-2">
                        {'• '}
                        <strong>{line.replace(/^- \*\*/, '').replace(/\*\*.*/, '')}</strong>
                        {line.replace(/^- \*\*[^*]+\*\*/, '')}
                      </p>
                    ) : line.startsWith('- ') ? (
                      <p className="ml-2">{'• '}{line.substring(2)}</p>
                    ) : (
                      <p>{line}</p>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Source references if available */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-1">Sources:</p>
                  <div className="flex flex-wrap gap-1">
                    {msg.sources.map((source, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {source}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User avatar */}
            {msg.role === 'user' && (
              <div className="shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-muted rounded-lg px-3 py-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ================================================================== */}
      {/* Example Queries (shown when only welcome message exists) */}
      {/* ================================================================== */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
          <div className="space-y-1">
            {exampleQueries.map((query, i) => (
              <button
                key={i}
                className="w-full text-left text-xs px-3 py-2 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                onClick={() => {
                  setInputValue(query);
                }}
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Input Area */}
      {/* ================================================================== */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            placeholder="Ask about your case data..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Powered by Azure OpenAI GPT-4o with RAG
        </p>
      </div>
    </aside>
  );
}
