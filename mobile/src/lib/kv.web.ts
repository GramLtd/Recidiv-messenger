/** Web build (used only for design previews): secrets in localStorage. */
export const secret = {
  get: async (k: string) => localStorage.getItem(`sec.${k}`),
  set: async (k: string, v: string) => { localStorage.setItem(`sec.${k}`, v); },
  del: async (k: string) => { localStorage.removeItem(`sec.${k}`); },
};
