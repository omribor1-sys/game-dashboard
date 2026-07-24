# Ticket Monitor — Source URLs (EPL, priority 1)

Provided by Omri 2026-07-22. Seed for the `monitor_sources` table (Phase A of the on-sale monitor).

**page_type legend:**
- `onsale-dates` — a page that *lists on-sale dates* as content → **easiest & best to scrape** (text diff).
- `news` — a ticket-news feed → scrape article titles/dates for on-sale announcements.
- `platform` — the live purchasing platform (JS-heavy, often login/membership) → hardest; Phase A just
  diffs the visible fixtures list, auto-read is Phase B/C.

| Club | URL | page_type | Notes |
|------|-----|-----------|-------|
| Liverpool | https://www.liverpoolfc.com/tickets/tickets-availability | platform | availability list |
| Tottenham | https://www.tottenhamhotspur.com/tickets/buy-tickets/home-tickets/ | platform | home tickets (utm stripped) |
| Man City | https://www.mancity.com/news/mens/ticket-news | news | ticket-news feed |
| Man City | https://tickets.mancity.com/en-GB/categories/Men's%20Tickets | platform | live purchase (SecuTix-style) |
| Man United | https://tickets.manutd.com/en-GB/categories/home-tickets | platform | live purchase |
| Arsenal | https://www.arsenal.com/tickets | platform | tickets landing |
| Chelsea | https://www.chelseafc.com/en/all-on-sale-dates | **onsale-dates** | ⭐ best-case scrape target |
| Newcastle | https://book.nufc.co.uk/en-GB/categories/Home%20Tickets | platform | live purchase |
| Fulham | https://www.fulhamfc.com/category/tickets | news | tickets category feed |
| Aston Villa | https://www.avfc.co.uk/category/tickets | news | tickets category feed |
| Crystal Palace | https://www.cpfc.co.uk/tickets/tickets-on-sale-dates/ | **onsale-dates** | ⭐ best-case scrape target |
| Everton | https://www.evertonfc.com/news/ticket-news | news | ticket-news feed |
| Wolves | https://www.wolves.co.uk/tickets-hospitality/ | platform | tickets landing |
| Brentford | https://www.eticketing.co.uk/brentfordfc | platform | eticketing.co.uk (login likely) |
| Nottingham Forest | https://www.nottinghamforest.co.uk/category/tickets | news | tickets category feed |
| Leeds United | https://www.leedsunited.com/en/news/listing/ticketing | news | ticketing news list |

**Best scrape targets first (Phase A):** the `onsale-dates` + `news` pages (Chelsea, Palace, Man City
news, Everton, Fulham, Villa, Forest, Leeds) — these publish on-sale dates as readable text, ideal for
text-diff + keyword detection. The `platform` pages (Arsenal, Spurs, Liverpool, Man Utd, Newcastle,
Wolves, Brentford) are JS/login-gated → Phase A diffs the fixtures list; structured read is Phase B.

## Missing (of the 20 tracked clubs) — need URLs from Omri
West Ham · Brighton · Bournemouth · Burnley · Sunderland.

(Note: these are the clubs Omri tracks. The 2026/27 fixtures also feature promoted sides
Coventry / Hull / Ipswich — add their ticket URLs when relevant.)

## Non-EPL & events (lower priority, from the same sheet — plain-text URLs already captured)
- AC Milan — https://booking.acmilan.com/en · Inter — https://www.inter.it/en/tickets · AS Roma — https://www.asroma.com/en/tickets/
- FIFA — https://www.fifa.com/en/tickets
- Ticketmaster (Coldplay/Billie Eilish), Taylor Swift, Linkin Park (concerts)
