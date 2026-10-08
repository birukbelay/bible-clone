/**
 * Custom HTML shell for the web build.
 *
 * The coi-serviceworker.js script is registered here so it runs before any
 * app code. It injects Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy
 * headers on every response, giving us crossOriginIsolated = true.
 * expo-sqlite needs this to use OPFS (navigator.storage.getDirectory).
 */
import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { ReactNode } from 'react';

export default function Root({ children }: { children: ReactNode }) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        {/*
         * Load the cross-origin isolation service worker script synchronously before
         * the app bundle. It registers a SW that injects COOP/COEP headers so
         * crossOriginIsolated = true — required by expo-sqlite's OPFS usage.
         * On first visit the SW installs and triggers one reload; afterwards it
         * intercepts every request transparently.
         */}
        <script src="/coi-serviceworker.js" />
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
