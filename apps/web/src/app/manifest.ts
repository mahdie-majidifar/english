import type { MetadataRoute } from 'next';

/** What a phone or computer needs to install the site like an app: its name, colours and icons. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'English Coach',
    short_name: 'Coach',
    description: 'Your personal English coach: practice what you learned today.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'en',
    background_color: '#faf8f5',
    theme_color: '#6c4dff',
    categories: ['education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: "Today's session", short_name: 'Session', url: '/session', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Practice', short_name: 'Practice', url: '/practice', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
