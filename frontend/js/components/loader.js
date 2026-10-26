/**
 * Component Loader
 * Dynamically mounts modular HTML component partials into [data-component] slots.
 */

/**
 * Asynchronously loads all modular HTML components defined via [data-component="..."]
 * @returns {Promise<void>}
 */
export async function loadComponents() {
  const slots = Array.from(document.querySelectorAll('[data-component]'));
  if (slots.length === 0) return;

  await Promise.all(
    slots.map(async (slot) => {
      const name = slot.getAttribute('data-component');
      if (!name) return;
      try {
        const response = await fetch(`/components/${name}.html`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const html = await response.text();
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        slot.replaceWith(template.content);
      } catch (err) {
        console.error(`[ComponentLoader] Failed to load component: ${name}`, err);
      }
    })
  );
}
