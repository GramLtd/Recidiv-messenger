import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ProfileView } from '../../components/Profile';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProfileView userId={Number(id)} />;
}
