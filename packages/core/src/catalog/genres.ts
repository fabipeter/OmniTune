import type { Genre } from '../types';

export const GENRES: Genre[] = [
  { id: 'pop', name: 'Pop', color: '#8d67ab', term: 'pop hits' },
  { id: 'hiphop', name: 'Hip-Hop', color: '#ba5d07', term: 'hip hop rap' },
  { id: 'rock', name: 'Rock', color: '#e91429', term: 'rock classics' },
  { id: 'dance', name: 'Dance & Electronic', color: '#0d73ec', term: 'electronic dance' },
  { id: 'rnb', name: 'R&B', color: '#dc148c', term: 'r&b soul' },
  { id: 'latin', name: 'Latin', color: '#e8115b', term: 'latin reggaeton' },
  { id: 'country', name: 'Country', color: '#bc5900', term: 'country hits' },
  { id: 'indie', name: 'Indie & Alternative', color: '#608108', term: 'indie alternative' },
  { id: 'kpop', name: 'K-Pop', color: '#477d95', term: 'k-pop' },
  { id: 'afro', name: 'Afrobeats', color: '#148a08', term: 'afrobeats' },
  { id: 'jazz', name: 'Jazz', color: '#1e3264', term: 'jazz' },
  { id: 'classical', name: 'Classical', color: '#7d4b32', term: 'classical piano orchestra' },
  { id: 'metal', name: 'Metal', color: '#5f4b8b', term: 'heavy metal' },
  { id: 'reggae', name: 'Reggae', color: '#509bf5', term: 'reggae' },
  { id: 'blues', name: 'Blues', color: '#2d46b9', term: 'blues' },
  { id: 'folk', name: 'Folk & Acoustic', color: '#a56752', term: 'folk acoustic' },
  { id: 'chill', name: 'Chill', color: '#d84000', term: 'chill lofi' },
  { id: 'workout', name: 'Workout', color: '#777777', term: 'workout energy' },
  { id: 'focus', name: 'Focus', color: '#503750', term: 'focus ambient instrumental' },
  { id: 'sleep', name: 'Sleep', color: '#1e3264', term: 'sleep ambient' },
  { id: 'party', name: 'Party', color: '#af2896', term: 'party anthems' },
  { id: 'throwback', name: 'Throwback', color: '#8c1932', term: '90s 2000s hits' },
];

export function findGenre(idOrName: string): Genre | undefined {
  const k = idOrName.toLowerCase();
  return GENRES.find((g) => g.id === k || g.name.toLowerCase() === k);
}
