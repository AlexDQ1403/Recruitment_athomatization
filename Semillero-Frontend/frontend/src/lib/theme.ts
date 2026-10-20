// Tema claro/oscuro compartido por la web pública y la app (misma preferencia guardada)
export const THEME_STORAGE_KEY = 'semillero_theme';
export const THEME_ATTR = 'data-landing-theme';

// Se ejecuta antes de pintar la página para aplicar el tema guardado sin parpadeo
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('${THEME_ATTR}',t)}catch(e){}})()`;
