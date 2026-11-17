import React from 'react';
import {
  ArrowUp, BadgeCheck, Check, ChevronLeft, ChevronRight, Copy, Ellipsis, Eye, Forward, Globe, Heart, Lock, LogOut,
  MessageCircle, Newspaper, Pencil, Plus, Repeat2, Reply, Search, Settings, Shield, Sparkles, Trash2, X, Zap,
} from 'lucide-react-native';

/** Same Lucide icon set as the web client, drawn natively with react-native-svg. */
const MAP = {
  back: ChevronLeft, chevron: ChevronRight, send: ArrowUp, check: Check, close: X, more: Ellipsis, heart: Heart,
  reply: Reply, copy: Copy, forward: Forward, edit: Pencil, trash: Trash2, lock: Lock, search: Search, plus: Plus,
  feed: Newspaper, chats: MessageCircle, settings: Settings, comment: MessageCircle, repost: Repeat2, eye: Eye,
  spark: Sparkles, verified: BadgeCheck, shield: Shield, globe: Globe, zap: Zap, logout: LogOut,
} as const;
export type IconName = keyof typeof MAP;

export function Icon({ name, size = 22, color = '#fff', stroke = 2, fill }: { name: IconName; size?: number; color?: string; stroke?: number; fill?: string }) {
  const I = MAP[name];
  return <I size={size} color={color} strokeWidth={stroke} fill={fill ?? 'none'} />;
}
