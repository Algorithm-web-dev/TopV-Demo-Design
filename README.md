# Handoff: Top Vending website

## Overview
A full marketing and catalogue website for Top Vending, a South African supplier of vending machines, hot beverage machines, water solutions, payment systems, recycling stations and consumables. Visitors browse the range, read product detail and brochures, build a quote list across products, and submit enquiries (quote, rental, consumables, service call).

## About the design files
The files in this bundle are **design references built in HTML**. They show the intended look, content and behaviour. They are not production code to copy over. Recreate them in the target codebase using its own framework and patterns. If no codebase exists yet, a component-based framework with file-based routing (for example Next.js or Astro) suits this site: 14 pages sharing one nav, one footer, one product-card and one product-detail pattern.

Each `.dc.html` file opens directly in a browser (it loads `support.js` beside it). Inside each file, the markup is the template and the `class Component` script at the bottom holds that page's data and state. Product data, FAQs and consumables lists all live in those scripts. Pull the data into a shared data layer (JSON or CMS) when you rebuild.

## Fidelity
**High fidelity.** Colours, type, spacing, copy and interactions are final. Recreate them pixel-accurately.

## Pages
| File | Page |
|---|---|
| `Top Vending.dc.html` | Home |
| `Vending Machines.dc.html` | Vending range + product detail |
| `Hot Beverage Solutions.dc.html` | Coffee range + product detail |
| `Water Solutions.dc.html` | Water range (Purezza highlight, then Top Coolers) + detail |
| `Payment Solutions.dc.html` | Payment systems, filtered by system type (cash, cashless, telemetry) + detail |
| `Recycling.dc.html` | Recycling stations + detail |
| `Products.dc.html` | All products, filterable |
| `Consumables.dc.html` | Consumables list with images, category filters, load more, add to quote |
| `Rentals.dc.html` | Rental programme + rental quote form |
| `About.dc.html` | About / our story |
| `Clients.dc.html` | Client logo grid |
| `Blog.dc.html` | Blog listing with topic filters and sidebar |
| `Blog Post.dc.html` | Article with sticky sidebar, keep reading, CTA |
| `Contact.dc.html` | Enquiry form (type set by referring page), hubs, FAQs |

## Shared layout
- **Page container:** `max-width: 1200px; margin: 0 auto`. Sections use `padding: 130px 48px` (product detail `150px 48px 130px`, page headers `170px 48px 60px`).
- **Section rhythm:** consecutive sections alternate `#FAFBFC` and `#EFF1F3` so each one reads as its own band. Dark bands use `#1C1C1A`.
- **Nav:** fixed, `top: 20px; left/right: 24px; height: 72px`, translucent white with `backdrop-filter: blur(18px)`, 1px `#E1E4E8` border, fully rounded. Contents: logo (links home), Products dropdown (categories), Consumables, Rentals, About, Our Clients, Blog, Contact dropdown (Technical Support), round search button, red "Get a Free Quote" pill. Below 1024px the links collapse into a burger and a dropdown panel. Below 700px the CTA moves into the panel.
- **Footer:** dark, link columns, logo linking home, centred bottom bar: "Privacy Policy", "Terms & Conditions", then © 2026 underneath.
- **CTA banner** (most pages): full-bleed photo (`assets/rentals-bg.jpg`) under a radial dark overlay, centred heading, grey body, red pill button.

## Components
- **Eyebrow:** 13px, 600, uppercase, letter-spacing 2px, `#C8102E`, 18px below.
- **Headings:** Inter 700, tight tracking (`-0.03em` to `-0.032em`). H1 52px / 1.05, section H2 36 to 42px / 1.1.
- **Body:** 16 to 17px, line-height 1.7, `#45443F`.
- **Buttons:** pills (`border-radius: 999px`), 15px 600. Primary is `#C8102E` (hover `#8f0c20`). Secondary is a 1.5px `#1C1C1A` outline that fills dark on hover.
- **Filter pills:** 1px `#D9D6CC` outline. The active pill fills `#C8102E` with white text. The first option reads "All Products".
- **Product card:** white, 1px `#E1E4E8` border, 20px radius, 300px white image panel (`object-fit: contain`, 14px padding), then category, name, tagline and Get a Quote. On hover it lifts 4px with a shadow and the border turns red.
- **Product detail:** two columns. On the left, a grey image panel stretched to the height of the content column. On the right: category, name, tagline, description, three buttons (Add to Quote, Download Brochure, More machines), key feature pills and the first 4 specs. Below that, a "More about this machine" block (brochure-derived paragraphs plus the full specification) collapsed behind Read more / Read less. Then a full-width `#EFF1F3` FAQ band.
- **FAQ accordion:** capped at 5 questions, all collapsed on load.
- **Image + copy feature rows** (home): 430px image with a soft dark gradient overlay. Image sides alternate down the page.
- **Client marquee:** logos normalised to equal optical size, scrolling continuously at the same speed as the hero marquee.

## Interactions & behaviour
- **Quote list** (`quote-cart.js`): "Add to Quote" on any product or consumable adds it to a floating list. The list only appears once something has been added, and it has a close ×. "Proceed with quote" opens the Contact form with every selected item listed.
- **Contact enquiry type** follows the referring page: rental, consumables, service call ("Log a Service Call" goes to service), or "Build your quote" when coming from product selection. It uses hash params such as `Contact.dc.html#type=service` and `#quote`.
- **Site search** (`site-search.js`): opened from the nav icon, the mobile menu Search row, or Cmd/Ctrl+K. A full-screen overlay with instant results grouped Machines / Consumables / Blog / Pages. Close with the round × or Esc. Machine results deep-link with `#product=<name>` to open that product's detail.
- **Product category pages:** clicking a card swaps to the detail view and scrolls to the top. "← All machines" returns to the grid.
- **Payment Solutions:** filter pills by system type. Each filter shows a short description, its products and its own FAQ set.
- **Consumables:** category filter pills. "All Products" shows 2 categories plus "Load More Categories" (+2 per click). On desktop, a thumbnail scales to about 2.1× on hover. The zoom is turned off for touch devices and screens under 900px. No prices are shown.
- **Download Brochure** links to `assets/brochures/<file>.pdf`. Five products have no brochure yet: P1 Bar Series E, P1 Bar Series B, Frizzante 80 Box, and the two Tritech recycling units.
- **Responsive** (`responsive.css`): grids drop to one column below 900px, padding and headings scale down, the detail image is capped at 440px, and the clients grid goes from 4 to 3 to 2 columns.

## Design tokens
**Colours**
- Brand red `#C8102E` · red hover `#8f0c20`
- Ink `#1C1C1A` · body text `#45443F` · muted `#6B6B68` · light muted `#A9AEB4`
- Background `#FAFBFC` · alternate band `#EFF1F3` · white `#FFFFFF`
- Borders `#E1E4E8` (UI) · `#D9D6CC` (pills and inputs)
- Text on dark bands `#A8A59C`

**Type:** Inter only (400, 500, 600, 700), applied globally.

**Radius:** cards 20px · small panels 14 to 16px · thumbnails 10px · buttons and pills 999px.

**Shadows:** card hover `0 18px 40px rgba(0,0,0,0.08)` · feature image `0 24px 60px rgba(28,28,26,0.18)` · overlays `0 30px 80px rgba(0,0,0,0.3)`.

## Assets
- `assets/logo.png`: header and footer logo.
- Product cut-outs in `assets/` (machines), `assets/payment/`, plus recycling images.
- Consumables: originals in `assets/consumables/`, resized 320px thumbnails in `assets/consumables/thumbs/` (use the thumbs).
- Client logos: `assets/customers/` (use the normalised versions the pages reference).
- Brochures: `assets/brochures/*.pdf`.
- Photography: hero, category and CTA images in `assets/`.

All of these come from the client. Use exactly the files the pages reference.

## Files
- `*.dc.html`: the 14 pages (template plus data and state).
- `support.js`: runtime that lets the `.dc.html` files open in a browser (reference only, don't port it).
- `quote-cart.js`: quote list.
- `site-search.js`: search overlay and its index (27+ machines, consumables, blog posts, pages).
- `responsive.css`: breakpoints and mobile overrides.
- `site-motion.js`: section fade-in on scroll.
- `assets/`: all images and PDFs.
