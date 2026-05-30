"use client";

import { create } from "zustand";

import {
  deleteChatConversation,
  listChatConversations,
  saveChatConversation,
  type ChatConversation,
  type ChatPersistedMessage,
} from "@/lib/api";

type SavePayload = {
  id?: string;
  title?: string;
  messages: ChatPersistedMessage[];
  upstream_conversation_id?: string;
};

type ChatConversationsState = {
  items: ChatConversation[];
  isLoading: boolean;
  hasLoaded: boolean;
  loadError: string;
  load: () => Promise<void>;
  save: (payload: SavePayload) => Promise<ChatConversation>;
  remove: (id: string) => Promise<void>;
};

function sortByUpdatedAt(items: ChatConversation[]): ChatConversation[] {
  return [...items].sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
}

function upsertConversation(items: ChatConversation[], next: ChatConversation): ChatConversation[] {
  const without = items.filter((item) => item.id !== next.id);
  return sortByUpdatedAt([next, ...without]);
}

export const useChatConversationsStore = create<ChatConversationsState>((set, get) => ({
  items: [],
  isLoading: false,
  hasLoaded: false,
  loadError: "",

  async load() {
    if (get().isLoading) return;
    set({ isLoading: true, loadError: "" });
    try {
      const data = await listChatConversations();
      set({
        items: sortByUpdatedAt(data.items || []),
        isLoading: false,
        hasLoaded: true,
        loadError: "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载会话失败";
      set({ isLoading: false, loadError: message });
      throw error;
    }
  },

  async save(payload) {
    const data = await saveChatConversation(payload);
    set({ items: upsertConversation(get().items, data.item) });
    return data.item;
  },

  async remove(id) {
    await deleteChatConversation(id);
    set({ items: get().items.filter((item) => item.id !== id) });
  },
}));
