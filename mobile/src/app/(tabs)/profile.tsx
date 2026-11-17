import React from 'react';
import { useStore } from '../../lib/store';
import { ProfileView } from '../../components/Profile';

export default function MyProfile() {
  const id = useStore((s) => s.me?.id);
  return id ? <ProfileView userId={id} own /> : null;
}
