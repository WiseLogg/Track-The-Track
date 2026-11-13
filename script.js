const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");

function closeMenu() {
  navToggle?.setAttribute("aria-expanded", "false");
  navToggle?.setAttribute("aria-label", "Open navigation");
  siteNav?.classList.remove("is-open");
  document.body.classList.remove("nav-open");
}

navToggle?.addEventListener("click", () => {
  const isOpen = navToggle.getAttribute("aria-expanded") === "true";

  navToggle.setAttribute("aria-expanded", String(!isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
  siteNav?.classList.toggle("is-open", !isOpen);
  document.body.classList.toggle("nav-open", !isOpen);
});

siteNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});

const year = document.querySelector("#current-year");

if (year) year.textContent = String(new Date().getFullYear());

function revealActiveWorkspaceLink() {
  const navigation = document.querySelector('.dashboard-nav');
  const active = navigation?.querySelector('[aria-current]');
  if (!active || navigation.scrollWidth <= navigation.clientWidth) return;
  const bounds = navigation.getBoundingClientRect();
  const link = active.getBoundingClientRect();
  if (link.right > bounds.right) navigation.scrollLeft += link.right - bounds.right + 1;
  else if (link.left < bounds.left) navigation.scrollLeft -= bounds.left - link.left + 1;
}
window.addEventListener('resize', revealActiveWorkspaceLink);
requestAnimationFrame(revealActiveWorkspaceLink);
