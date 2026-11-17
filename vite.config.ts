import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/**
 * Arquitectura multipágina (MPA): cada página HTML es un punto de entrada real.
 * Comparten componentes, estilos y servicios desde /src.
 */
const pages = [
  'index',
  'panel',
  'calendario',
  'solicitudes',
  'nueva-solicitud',
  'recursos',
  'entregas',
  'historial',
  'usuarios',
  'recuperar',
]

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        pages.map((p) => [p, resolve(__dirname, `${p}.html`)]),
      ),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
})
