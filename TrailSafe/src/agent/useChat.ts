import { useCallback, useRef, useState } from 'react';

import type { AppState, ChatMessage } from '../shared/types';
import { sendMessage } from './survivalAgent';

const WELCOME_TEXT =
  "Hi! I'm your AI guide. I can help you navigate back to safety using your offline map and location history. How can I assist you?";

function makeWelcomeMessage(): ChatMessage[] {
  return [
    { id: 'welcome', role: 'assistant', text: WELCOME_TEXT, timestamp: Date.now() },
  ];
}

const DEFAULT_APP_STATE: AppState = {
  position: null,
  destination: null,
  isOffline: false,
  isStationary: false,
  batteryLevel: 1,
};

let nextId = 1;
function makeId(): string {
  return `msg-${Date.now()}-${nextId++}`;
}

export function useChat(appState?: AppState) {
  const state = appState ?? DEFAULT_APP_STATE;
  const [messages, setMessages] = useState<ChatMessage[]>(makeWelcomeMessage);
  const [isLoading, setIsLoading] = useState(false);
  const busyRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const stateRef = useRef(state);
  stateRef.current = state;

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busyRef.current) return;
      busyRef.current = true;

      const userMsg: ChatMessage = {
        id: makeId(),
        role: 'user',
        text: trimmed,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const allMessages = [...messagesRef.current, userMsg];
        const reply = await sendMessage(trimmed, stateRef.current, allMessages);

        const assistantMsg: ChatMessage = {
          id: makeId(),
          role: 'assistant',
          text: reply,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        const errorMsg: ChatMessage = {
          id: makeId(),
          role: 'assistant',
          text: 'Stay calm, stay put, conserve energy, and signal for help.',
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        busyRef.current = false;
        setIsLoading(false);
      }
    },
    [],
  );

  return { messages, isLoading, send };
}
