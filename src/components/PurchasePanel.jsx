import { useState, useEffect, useRef } from 'react'
import { useGameStore, TOTAL_TILES, PURCHASE_ZOOM } from '../store/gameStore'
import { useGuardianStore } from '../store/guardianStore'
import { usePriceStore, SOURCE_META } from '../store/priceStore'
import { tileBasePrice, lngLatToTile, tileNW, GRID_N, geoRegion } from '../lib/tiles'
import { useIsMobile } from '../lib/hooks'
import { api } from '../lib/api'
import { shortAddr } from '../lib/addr'
import TileCertificate, { MiniCertificate } from './TileCertificate'

function fakeViewers(tx, ty) {
  const h = ((tx * 3571 + ty * 7919) >>> 0) % 23
  return 3 + h
}

// ─── Territory narratives — geo-specific, country-aware ──────────────────────
// Regions are checked most-specific first. Each has a pool of short, honest
// descriptions drawn from real geography, economy, and land character.
// A deterministic hash picks one per tile — same tile always gets same text.

const NARRATIVES = [
  // ── City cores — most specific, checked first ──────────────────────────────
  { lngMin: -74.05, lngMax: -73.90, latMin: 40.68, latMax: 40.88, lines: [
    'Manhattan bedrock. 1.6 million people on 87 sq km — the most valuable urban land on Earth.',
    'Midtown commercial core. Office towers, global HQ clusters, and some of the highest rents per sq ft anywhere.',
    'Financial District. NYSE, Federal Reserve, and centuries of concentrated capital on one small island.',
    'Upper West Side residential grid. Brownstones, Central Park access, and persistent demand far above supply.',
  ]},
  { lngMin: -0.18, lngMax: 0.00, latMin: 51.48, latMax: 51.56, lines: [
    'Inner London. The City and West End together generate more financial output than most countries.',
    'Zone 1 London. Transport links, global institutions, and a housing market that has never meaningfully corrected.',
    'Central London, where global capital has parked itself in property for 300 years without interruption.',
    'South Bank. Regenerated riverside, arts institutions, and one of the fastest-rising postcodes in Western Europe.',
  ]},
  { lngMin: 2.28, lngMax: 2.42, latMin: 48.82, latMax: 48.91, lines: [
    'Central Paris. Haussmann boulevards, tourism density, and property values that have climbed every decade since 1950.',
    'Paris intra-muros. 2 million people in 105 sq km — land here trades at €12,000–20,000 per sq metre.',
    'The Marais to Saint-Germain corridor. Historic stone architecture, global tourism, and near-zero vacancy.',
    'Île-de-France core. The world\'s most visited urban area, built on limestone that has held value for a millennium.',
  ]},
  { lngMin: 139.65, lngMax: 139.82, latMin: 35.63, latMax: 35.74, lines: [
    'Tokyo\'s 23 wards. 9 million residents in the world\'s largest metropolitan economy.',
    'Shinjuku–Shibuya corridor. Commercial density, global brand presence, and land prices to match.',
    'Tokyo Bay waterfront. Reclaimed land, tech campuses, and one of Asia\'s most liquid property markets.',
    'Yamanote Line interior. The premium residential and commercial ring that defines central Tokyo.',
  ]},
  { lngMin: 126.96, lngMax: 127.06, latMin: 37.52, latMax: 37.60, lines: [
    'Central Seoul. Gangnam district sits here — Asia\'s most expensive residential real estate outside Singapore.',
    'Han River corridor. Seoul\'s commercial spine, connecting Yeouido finance to Gangnam tech.',
    'Jongno–Jung district. Historic centre of Korea\'s capital, now layered with government and media institutions.',
  ]},
  { lngMin: 103.80, lngMax: 104.00, latMin: 1.24, latMax: 1.42, lines: [
    'Singapore city-state. Zero capital gains tax, rule of law, and land so scarce the government reclaims the sea.',
    'Marina Bay. Singapore\'s $20bn financial district built on reclaimed land — among the world\'s priciest sq metres.',
    'Orchard Road to Tanjong Pagar. The commercial heart of Southeast Asia\'s wealthiest sovereign nation.',
  ]},
  { lngMin: 55.10, lngMax: 55.25, latMin: 25.05, latMax: 25.20, lines: [
    'Dubai Marina and Downtown. Freehold zones attracting capital from 180+ countries, zero income tax.',
    'DIFC. Dubai\'s financial centre operates under English common law inside the UAE — a deliberate capital magnet.',
    'Palm Jumeirah and beachfront Dubai. Artificial land, luxury demand, and a government that moves fast.',
  ]},
  { lngMin: -43.20, lngMax: -43.10, latMin: -22.96, latMax: -22.88, lines: [
    'Rio de Janeiro. Iconic coastal geography, Carnival economy, and a city learning to price its irreplaceable views.',
    'Copacabana to Ipanema. The world\'s most famous beachfront, where real estate competes with São Paulo\'s Faria Lima.',
  ]},
  { lngMin: -46.70, lngMax: -46.58, latMin: -23.58, latMax: -23.52, lines: [
    'São Paulo financial core. The Faria Lima corridor is Latin America\'s Wall Street — BRL billions managed per block.',
    'Paulista Avenue. Brazil\'s commercial backbone: banks, media, tech unicorns, and the highest office rents in South America.',
  ]},
  { lngMin: 28.93, lngMax: 29.02, latMin: 41.00, latMax: 41.06, lines: [
    'Istanbul\'s Bosphorus corridor. 15 million people, two continents, and a property market that locals call recession-proof.',
    'Beyoğlu and Taksim. Istanbul\'s cultural and commercial centre, where European capital meets Anatolian demand.',
  ]},
  { lngMin: 37.55, lngMax: 37.70, latMin: 55.70, latMax: 55.82, lines: [
    'Moscow\'s Garden Ring. Russia\'s most expensive real estate — ruble-denominated but dollar-desired.',
    'Moscow City. The glass towers of Moscow\'s financial district, purpose-built to rival London and Frankfurt.',
  ]},

  // ── Sub-national regions — specific geography ──────────────────────────────
  // California
  { lngMin: -122.55, lngMax: -121.90, latMin: 37.20, latMax: 37.90, lines: [
    'San Francisco Bay Area. The wealthiest tech labour market in history, where median house prices exceed $1.3 million.',
    'Silicon Valley. Palo Alto to San Jose: a 50km strip that produced more shareholder value than most G20 nations.',
    'San Francisco. 47 sq miles of peninsula, global tech HQ concentration, and a housing supply permanently constrained by geography.',
  ]},
  { lngMin: -118.55, lngMax: -117.90, latMin: 33.85, latMax: 34.20, lines: [
    'Los Angeles basin. Entertainment capital of the world, with land values anchored by sun, geography, and permanent demand.',
    'West LA to Santa Monica. Media industry, tech expansion, and Pacific-facing land that rarely depreciates.',
    'LA County. The largest urban economy in the US west of Chicago, with 10 million people on coastal real estate.',
  ]},
  // New York State
  { lngMin: -74.30, lngMax: -73.70, latMin: 40.50, latMax: 41.10, lines: [
    'New York metro. The largest US city by GDP, anchored by finance, media, fashion, and irreplaceable urban density.',
    'Brooklyn and Queens. Formerly affordable inner boroughs now pricing in their proximity to Manhattan.',
    'Greater NYC. 20 million people in the tristate area generate 10% of US GDP in one metropolitan cluster.',
  ]},
  // Texas
  { lngMin: -97.80, lngMax: -97.50, latMin: 30.15, latMax: 30.45, lines: [
    'Austin metro. No state income tax, a university town that became a tech hub, and a decade of explosive in-migration.',
    'Austin. Tesla, Apple, Oracle relocated operations here. Population doubled in 20 years. Land followed.',
  ]},
  { lngMin: -95.60, lngMax: -95.20, latMin: 29.60, latMax: 29.90, lines: [
    'Houston. The energy capital of North America: oil, LNG, petrochemicals, and the largest US port by tonnage.',
    'Houston Ship Channel corridor. Refineries, container terminals, and industrial land priced on hydrocarbon cycles.',
  ]},
  // Pacific Northwest
  { lngMin: -122.50, lngMax: -122.20, latMin: 47.45, latMax: 47.75, lines: [
    'Seattle metro. Amazon HQ, Boeing, and Microsoft within 30 miles of each other — among the fastest-appreciating US cities.',
    'Greater Seattle. No state income tax, Pacific port access, and a tech labour market that bids up every parcel.',
  ]},
  // Florida
  { lngMin: -80.30, lngMax: -80.10, latMin: 25.70, latMax: 25.90, lines: [
    'Miami. Financial gateway between the US and Latin America. No state income tax. Sea-level concerns already priced in.',
    'Brickell and Miami Beach. Luxury condo market attracting NY and LA capital south, dollar-denominated in a tax-free state.',
  ]},

  // ── UK sub-regions ────────────────────────────────────────────────────────
  { lngMin: -3.30, lngMax: -3.10, latMin: 51.45, latMax: 51.55, lines: [
    'Cardiff. Welsh capital experiencing post-devolution investment — government, media, and university anchor.',
  ]},
  { lngMin: -2.00, lngMax: -1.80, latMin: 53.35, latMax: 53.50, lines: [
    'Manchester. The UK\'s second financial centre: media city, tech growth, and Northern Powerhouse investment.',
    'Greater Manchester. A city that reversed post-industrial decline. Property prices rising faster than London\'s since 2015.',
  ]},
  { lngMin: -1.65, lngMax: -1.45, latMin: 52.40, latMax: 52.52, lines: [
    'Birmingham. UK\'s second-largest city, HSBC relocated its HQ here. Commonwealth Games legacy investment ongoing.',
  ]},
  { lngMin: -3.25, lngMax: -3.05, latMin: 55.90, latMax: 56.00, lines: [
    'Edinburgh. Scotland\'s financial capital. Asset management, tourism, and a medieval city that never loses its premium.',
  ]},

  // ── France sub-regions ────────────────────────────────────────────────────
  { lngMin: -0.80, lngMax: -0.50, latMin: 44.78, latMax: 44.90, lines: [
    'Bordeaux. Wine capital of the world. Since direct TGV to Paris opened in 2017, property values jumped 40%.',
  ]},
  { lngMin: 5.33, lngMax: 5.42, latMin: 43.27, latMax: 43.33, lines: [
    'Marseille. France\'s second city and largest Mediterranean port. Undervalued relative to Paris, rapidly regenerating.',
  ]},
  { lngMin: 7.22, lngMax: 7.32, latMin: 43.68, latMax: 43.74, lines: [
    'Nice and Côte d\'Azur. The French Riviera — Europe\'s most expensive coastal property outside Monaco.',
  ]},

  // ── Germany sub-regions ───────────────────────────────────────────────────
  { lngMin: 13.28, lngMax: 13.55, latMin: 52.45, latMax: 52.58, lines: [
    'Berlin. German capital, startup hub, and still among the most affordable major European capitals — for now.',
    'Berlin Mitte. Government quarter, tech corridor, and a rental market that went from the cheapest in Europe to rapidly rising.',
  ]},
  { lngMin: 11.45, lngMax: 11.70, latMin: 48.07, latMax: 48.23, lines: [
    'Munich. Germany\'s most expensive city: BMW, Siemens, MAN, Allianz — and property prices to match.',
    'Munich metro. Bavarian capital with full employment, luxury auto manufacturing, and a housing shortage baked in.',
  ]},
  { lngMin: 8.55, lngMax: 8.75, latMin: 50.05, latMax: 50.15, lines: [
    'Frankfurt. European Central Bank HQ. The eurozone\'s financial capital, with the most premium office rents in Germany.',
  ]},
  { lngMin: 9.88, lngMax: 10.08, latMin: 53.50, latMax: 53.62, lines: [
    'Hamburg. Germany\'s largest port city and media capital. Container trade, Airbus manufacturing, and cultural value.',
  ]},

  // ── Spain ─────────────────────────────────────────────────────────────────
  { lngMin: -3.80, lngMax: -3.55, latMin: 40.35, latMax: 40.50, lines: [
    'Madrid. Spain\'s capital and largest economy: government, finance, and a real estate market recovering sharply post-2015.',
    'Madrid Centro. Golden Triangle of Art, Paseo de la Castellana, and the most liquid property market on the Iberian Peninsula.',
  ]},
  { lngMin: 2.08, lngMax: 2.22, latMin: 41.33, latMax: 41.43, lines: [
    'Barcelona. Catalonia\'s capital: tech scene, tourism, architecture, and a housing market chronically undersupplied.',
    'Eixample and Gothic Quarter. Barcelona\'s premium grid — Gaudí, Mediterranean light, and €5,000/m² asking prices.',
  ]},

  // ── Italy ─────────────────────────────────────────────────────────────────
  { lngMin: 9.10, lngMax: 9.25, latMin: 45.42, latMax: 45.50, lines: [
    'Milan. Italy\'s financial and fashion capital. UniCredit, Pirelli, Armani — and the highest property rents in Italy.',
    'Milan\'s Quadrilateral of Fashion. Four streets that generate more luxury spend per sq metre than anywhere outside Paris.',
  ]},
  { lngMin: 12.44, lngMax: 12.52, latMin: 41.88, latMax: 41.92, lines: [
    'Rome. Eternal City and Italian capital. Tourism density, government employment, and heritage constraints on new supply.',
    'Rome\'s historic centre. A UNESCO site where no building has exceeded four storeys in 500 years, limiting supply forever.',
  ]},

  // ── Netherlands ───────────────────────────────────────────────────────────
  { lngMin: 4.82, lngMax: 4.98, latMin: 52.34, latMax: 52.42, lines: [
    'Amsterdam. ASML, Booking.com, and a canal-ring city where land supply is physically capped by water.',
    'Amsterdam city centre. Listed UNESCO canal belt: no new buildings, rising demand, and the Netherlands\' highest rents.',
  ]},

  // ── Switzerland ───────────────────────────────────────────────────────────
  { lngMin: 8.50, lngMax: 8.60, latMin: 47.36, latMax: 47.42, lines: [
    'Zürich. Switzerland\'s financial capital. UBS, Credit Suisse legacy, and the most expensive city in Europe by multiple measures.',
    'Zürich lakefront. Private banking, pharmaceutical HQs, and property that rarely sells because owners rarely need to.',
  ]},
  { lngMin: 6.12, lngMax: 6.18, latMin: 46.20, latMax: 46.22, lines: [
    'Geneva. UN headquarters, Red Cross, WTO, and 40% of residents foreign nationals — a permanent premium city.',
  ]},

  // ── UAE / Gulf ────────────────────────────────────────────────────────────
  { lngMin: 54.33, lngMax: 54.45, latMin: 24.42, latMax: 24.52, lines: [
    'Abu Dhabi. UAE\'s capital and ADNOC home. Sovereign wealth fund assets exceed $1 trillion managed from this city.',
  ]},
  { lngMin: 51.48, lngMax: 51.60, latMin: 25.26, latMax: 25.34, lines: [
    'Doha. Qatar\'s capital, post-World Cup legacy infrastructure, and LNG wealth concentrated in one city.',
    'West Bay, Doha. Qatar\'s gleaming financial district built in 20 years on LNG revenues. Expat-dominated, tax-free.',
  ]},

  // ── India sub-regions ─────────────────────────────────────────────────────
  { lngMin: 72.80, lngMax: 73.00, latMin: 18.90, latMax: 19.05, lines: [
    'Mumbai. India\'s financial capital — BSE, RBI, Bollywood, and land prices rivalling Hong Kong in the premium districts.',
    'South Mumbai (Nariman Point–Colaba). India\'s Manhattan equivalent: the densest concentration of corporate India.',
  ]},
  { lngMin: 77.55, lngMax: 77.70, latMin: 12.90, latMax: 13.05, lines: [
    'Bengaluru. India\'s Silicon Valley. Infosys, Wipro, Flipkart — and a tech labour pool that has driven property values up 300% since 2000.',
    'Whitefield and Electronic City. Bengaluru\'s tech park corridors, where global IT campuses cluster on former farmland.',
  ]},
  { lngMin: 77.10, lngMax: 77.30, latMin: 28.55, latMax: 28.72, lines: [
    'Delhi NCR. India\'s political capital and its fastest-growing real estate market. Government employment anchors a vast metro.',
    'Gurgaon (Gurugram). Delhi\'s satellite city: a decade of skyscrapers, multinational offices, and prices that surprised everyone.',
  ]},
  { lngMin: 80.20, lngMax: 80.35, latMin: 13.00, latMax: 13.12, lines: [
    'Chennai. India\'s auto manufacturing hub: Hyundai, Ford, BMW, Renault all built plants here. IT sector expanding.',
  ]},

  // ── China sub-regions ─────────────────────────────────────────────────────
  { lngMin: 121.35, lngMax: 121.55, latMin: 31.18, latMax: 31.32, lines: [
    'Shanghai. China\'s financial capital and largest city. Pudong\'s skyline rose from rice fields in 30 years.',
    'Lujiazui, Shanghai. The Pearl Tower district — China\'s answer to Wall Street, built entirely since 1990.',
    'Shanghai French Concession. Tree-lined lanes, boutiques, and some of the most desired square metres in China.',
  ]},
  { lngMin: 116.32, lngMax: 116.50, latMin: 39.88, latMax: 40.00, lines: [
    'Beijing. China\'s political capital. Government proximity drives permanent demand for the best urban addresses.',
    'Chaoyang district, Beijing. Embassy quarter, CBD, and the address where China\'s business elite choose to live.',
  ]},
  { lngMin: 113.85, lngMax: 114.05, latMin: 22.52, latMax: 22.62, lines: [
    'Shenzhen. China\'s innovation capital: Huawei, Tencent, DJI. From fishing village to 13 million people in 40 years.',
    'Nanshan, Shenzhen. Tencent campus, tech venture density, and property prices that overtook Beijing in 2016.',
  ]},
  { lngMin: 113.20, lngMax: 113.38, latMin: 23.10, latMax: 23.20, lines: [
    'Guangzhou. Pearl River Delta manufacturing hub and South China trade gateway. Canton Fair anchors global commerce here.',
  ]},
  { lngMin: 104.00, lngMax: 104.18, latMin: 30.60, latMax: 30.72, lines: [
    'Chengdu. Western China\'s economic capital. Intel, Dell, Foxconn factories here. Panda diplomacy and hot pot are secondary.',
  ]},

  // ── Japan sub-regions ─────────────────────────────────────────────────────
  { lngMin: 135.45, lngMax: 135.58, latMin: 34.67, latMax: 34.72, lines: [
    'Osaka. Japan\'s second city and kitchen capital. Pharmaceutical manufacturing, Expo 2025 legacy, and casino resort incoming.',
    'Namba and Shinsaibashi. Osaka\'s commercial core: among Japan\'s most visited districts outside Tokyo.',
  ]},
  { lngMin: 135.74, lngMax: 135.82, latMin: 35.00, latMax: 35.04, lines: [
    'Kyoto. Ancient capital, UNESCO temple density, and strict zoning that keeps building heights below the treeline.',
    'Kyoto Higashiyama. Traditional machiya townhouses in the most-preserved historic district in Japan.',
  ]},
  { lngMin: 130.38, lngMax: 130.48, latMin: 33.57, latMax: 33.63, lines: [
    'Fukuoka. Japan\'s fastest-growing city. Gateway to South Korea, low cost of living, and a startup visa programme.',
  ]},

  // ── South Korea ───────────────────────────────────────────────────────────
  { lngMin: 126.98, lngMax: 127.10, latMin: 37.48, latMax: 37.56, lines: [
    'Gangnam, Seoul. Asia\'s most expensive residential address outside Singapore — private tutoring academies and K-beauty HQs.',
    'Yeouido, Seoul. Korea\'s Wall Street: NH, KB, Mirae Asset, and the National Assembly on a Han River island.',
  ]},
  { lngMin: 129.03, lngMax: 129.12, latMin: 35.15, latMax: 35.22, lines: [
    'Busan. South Korea\'s second city and largest port. Shipbuilding, container logistics, and a film festival that draws the world.',
  ]},

  // ── Australia ─────────────────────────────────────────────────────────────
  { lngMin: 150.98, lngMax: 151.30, latMin: -33.98, latMax: -33.80, lines: [
    'Sydney CBD and Eastern Suburbs. Australia\'s most expensive real estate — harbour access, limited land, and persistent demand.',
    'Sydney. Global city, Pacific gateway, and a housing market that turned every homeowner into a millionaire since 2000.',
  ]},
  { lngMin: 144.90, lngMax: 145.10, latMin: -37.88, latMax: -37.74, lines: [
    'Melbourne CBD. Australia\'s cultural capital: arts, coffee, sport, and a CBD that held value through every cycle.',
    'Melbourne. Tech sector, student population, and a liveability reputation that keeps attracting capital.',
  ]},
  { lngMin: 153.00, lngMax: 153.12, latMin: -27.52, latMax: -27.44, lines: [
    'Brisbane. Fastest-growing major Australian city. 2032 Olympics infrastructure investment underway.',
  ]},

  // ── Southeast Asia ────────────────────────────────────────────────────────
  { lngMin: 100.49, lngMax: 100.58, latMin: 13.72, latMax: 13.78, lines: [
    'Bangkok Sukhumvit. Thailand\'s commercial spine: expat concentration, BTS Skytrain access, and rising condo prices.',
    'Bangkok CBD. Silom and Sathorn — Thailand\'s financial district, home to regional HQs and luxury hotel clusters.',
  ]},
  { lngMin: 106.67, lngMax: 106.75, latMin: 10.76, latMax: 10.82, lines: [
    'Ho Chi Minh City. Vietnam\'s economic engine: manufacturing boom, tech startups, and a property market foreigners can now access.',
    'District 1, HCMC. Colonial-era boulevards now lined with luxury retail — Vietnam\'s fastest-appreciating urban core.',
  ]},
  { lngMin: 105.82, lngMax: 105.88, latMin: 21.00, latMax: 21.06, lines: [
    'Hanoi. Vietnam\'s political capital. Government employment stability and rising demand from a growing middle class.',
  ]},
  { lngMin: 106.78, lngMax: 106.88, latMin: -6.22, latMax: -6.16, lines: [
    'Jakarta. Indonesia\'s 10-million-person capital, about to lose its status as capital — but not its economic dominance.',
  ]},
  { lngMin: 101.63, lngMax: 101.73, latMin: 3.12, latMax: 3.18, lines: [
    'Kuala Lumpur. Malaysia\'s capital and KLCC district: Petronas Towers, no capital gains tax, and expat-friendly freehold zones.',
  ]},
  { lngMin: 120.96, lngMax: 121.02, latMin: 14.57, latMax: 14.63, lines: [
    'Metro Manila. Philippines\' capital with 24 million people — Makati CBD, BGC tech park, and call-centre economy.',
    'Makati, Manila. The Philippines\' financial core: conglomerate towers, BPO industry, and peso-denominated premium land.',
  ]},

  // ── Africa sub-regions ────────────────────────────────────────────────────
  { lngMin: 28.00, lngMax: 28.12, latMin: -26.25, latMax: -26.17, lines: [
    'Johannesburg CBD and Sandton. Africa\'s wealthiest square mile. JSE, Investec, Standard Bank — the continent\'s Wall Street.',
    'Sandton, Joburg. Sub-Saharan Africa\'s premier commercial address. Rand-denominated but dollar-watched.',
  ]},
  { lngMin: 18.40, lngMax: 18.50, latMin: -34.00, latMax: -33.90, lines: [
    'Cape Town. South Africa\'s most expensive housing market: Atlantic Seaboard prices rival coastal Portugal.',
    'V&A Waterfront, Cape Town. Trophy real estate on one of the world\'s great natural harbours.',
  ]},
  { lngMin: 3.35, lngMax: 3.45, latMin: 6.42, latMax: 6.50, lines: [
    'Lagos Island. Nigeria\'s commercial capital. Largest economy in Africa, and a real estate market priced in dollars.',
    'Victoria Island, Lagos. Nigeria\'s premium address: oil companies, international banks, and a local elite with deep pockets.',
  ]},
  { lngMin: 36.78, lngMax: 36.88, latMin: -1.32, latMax: -1.26, lines: [
    'Nairobi. East Africa\'s tech hub: M-Pesa was born here. Westlands and Kilimani are becoming Nairobi\'s own Sandton.',
  ]},
  { lngMin: 31.22, lngMax: 31.30, latMin: 30.04, latMax: 30.10, lines: [
    'Cairo. 22 million people, the Arab world\'s largest city. New Administrative Capital being built from scratch nearby.',
  ]},
  { lngMin: -17.48, lngMax: -17.42, latMin: 14.68, latMax: 14.74, lines: [
    'Dakar. Senegal\'s capital, West Africa\'s most stable economy, and a growing tech startup scene.',
  ]},

  // ── Latin America sub-regions ─────────────────────────────────────────────
  { lngMin: -58.50, lngMax: -58.35, latMin: -34.65, latMax: -34.57, lines: [
    'Buenos Aires. Paris of South America: European architecture, beef, tango, and a peso that tests investors\' patience.',
    'Palermo, Buenos Aires. BA\'s premium neighbourhood: boutique hotels, tech companies, and the city\'s highest rents.',
  ]},
  { lngMin: -70.70, lngMax: -70.60, latMin: -33.48, latMax: -33.40, lines: [
    'Santiago, Chile. Latin America\'s most stable economy. Las Condes and Vitacura rival any South American premium address.',
  ]},
  { lngMin: -74.12, lngMax: -74.02, latMin: 4.60, latMax: 4.68, lines: [
    'Bogotá. Colombia\'s capital at 2,600m elevation. Zona Rosa and Chicó are where oil money and tech money converge.',
  ]},
  { lngMin: -77.07, lngMax: -76.97, latMin: -12.10, latMax: -12.04, lines: [
    'Lima. Peru\'s coastal capital, Miraflores and San Isidro: South America\'s most underrated premium real estate.',
  ]},
  { lngMin: -66.92, lngMax: -66.84, latMin: 10.47, latMax: 10.53, lines: [
    'Caracas. Venezuela\'s capital — extraordinary geography, extraordinary dysfunction. Priced accordingly.',
  ]},
  { lngMin: -84.12, lngMax: -84.04, latMin: 9.92, latMax: 9.96, lines: [
    'San José, Costa Rica. Stable democracy, expat magnet, growing tech sector. Central America\'s most liveable capital.',
  ]},
  { lngMin: -79.55, lngMax: -79.48, latMin: 8.98, latMax: 9.02, lines: [
    'Panama City. Dollar economy, canal revenues, and a financial centre built deliberately to attract Latin American capital.',
  ]},
  { lngMin: -69.95, lngMax: -69.85, latMin: 18.47, latMax: 18.51, lines: [
    'Santo Domingo. Dominican Republic\'s capital and a growing hub for US-adjacent investment.',
  ]},

  // ── Canada sub-regions ────────────────────────────────────────────────────
  { lngMin: -79.50, lngMax: -79.30, latMin: 43.62, latMax: 43.78, lines: [
    'Toronto. Canada\'s financial capital. Bay Street, Big Five banks, and a condo market that makes economists nervous.',
    'Downtown Toronto. The most expensive real estate in Canada: waterfront access, financial density, and chronic undersupply.',
  ]},
  { lngMin: -123.20, lngMax: -123.00, latMin: 49.20, latMax: 49.32, lines: [
    'Vancouver. Asia-Pacific gateway, mountains-to-ocean geography, and property prices that caused a national conversation about affordability.',
    'Metro Vancouver. Every geographic constraint — ocean, mountains, border — pushes prices up. Supply cannot catch demand.',
  ]},
  { lngMin: -73.70, lngMax: -73.52, latMin: 45.48, latMax: 45.58, lines: [
    'Montréal. Canada\'s second city, French-speaking, and home to the lowest housing costs among major Canadian metros — still rising.',
  ]},

  // ── Russia sub-regions ────────────────────────────────────────────────────
  { lngMin: 30.25, lngMax: 30.40, latMin: 59.92, latMax: 59.98, lines: [
    'St. Petersburg. Russia\'s cultural capital. Hermitage, Nevsky Prospekt, and real estate that foreign buyers once prized.',
  ]},
  { lngMin: 82.88, lngMax: 82.98, latMin: 54.98, latMax: 55.04, lines: [
    'Novosibirsk. Siberia\'s largest city, Akademgorodok science city nearby. Russia\'s eastern economic anchor.',
  ]},

  // ── Eastern Europe sub-regions ────────────────────────────────────────────
  { lngMin: 21.00, lngMax: 21.08, latMin: 52.21, latMax: 52.27, lines: [
    'Warsaw. Poland\'s capital transformed: Złota 44, the Spire — Warsaw is becoming Central Europe\'s Frankfurt.',
    'Warsaw City Centre. The fastest-growing office market in the EU. Rents rose 40% in 5 years.',
  ]},
  { lngMin: 14.40, lngMax: 14.48, latMin: 50.07, latMax: 50.11, lines: [
    'Prague. Czech capital. EU-funded infrastructure, tourism density, and property that outperformed Vienna for a decade.',
  ]},
  { lngMin: 19.02, lngMax: 19.08, latMin: 47.47, latMax: 47.53, lines: [
    'Budapest. Hungary\'s capital on the Danube. Buda Hills premium market and a Pest commercial core mid-cycle.',
  ]},
  { lngMin: 24.10, lngMax: 24.20, latMin: 56.93, latMax: 56.98, lines: [
    'Riga. Latvia\'s capital, Baltic state, EU member. Art Nouveau heritage and a tech sector punching above its weight.',
  ]},
  { lngMin: 25.27, lngMax: 25.33, latMin: 54.67, latMax: 54.72, lines: [
    'Vilnius. Lithuania\'s capital, Fintech hub of the Baltics, and a startup visa attracting founders across the EU.',
  ]},
  { lngMin: 24.73, lngMax: 24.79, latMin: 59.43, latMax: 59.45, lines: [
    'Tallinn. Estonia\'s capital: birthplace of Skype, e-residency pioneer, and the most digitally advanced government in Europe.',
  ]},
  { lngMin: 26.10, lngMax: 26.18, latMin: 44.42, latMax: 44.46, lines: [
    'Bucharest. Romania\'s capital, EU member since 2007. IT sector growing rapidly — the fastest tech job market in Eastern Europe.',
  ]},
  { lngMin: 23.73, lngMax: 23.79, latMin: 37.97, latMax: 38.01, lines: [
    'Athens. Greek capital on limestone hills. Mediterranean tourism anchor, recovering from a deep correction, and now rising.',
  ]},

  // ── Turkey ────────────────────────────────────────────────────────────────
  { lngMin: 32.82, lngMax: 32.90, latMin: 39.92, latMax: 39.96, lines: [
    'Ankara. Turkey\'s administrative capital. Government employment, university density, more affordable than Istanbul.',
  ]},
  { lngMin: 27.12, lngMax: 27.20, latMin: 38.42, latMax: 38.46, lines: [
    'İzmir. Turkey\'s third city. Aegean coast, port economy, and a growing tech scene. Cosmopolitan relative to Ankara.',
  ]},

  // ── Central Asia ──────────────────────────────────────────────────────────
  { lngMin: 71.40, lngMax: 71.48, latMin: 51.16, latMax: 51.20, lines: [
    'Nur-Sultan (Astana). Kazakhstan\'s purpose-built capital. Oil wealth architecture in the Central Asian steppe.',
  ]},
  { lngMin: 76.88, lngMax: 76.96, latMin: 43.24, latMax: 43.28, lines: [
    'Almaty. Kazakhstan\'s financial capital, former seat of government, and the most Westernised city in Central Asia.',
  ]},
  { lngMin: 69.22, lngMax: 69.30, latMin: 41.30, latMax: 41.34, lines: [
    'Tashkent. Uzbekistan\'s capital, Central Asia\'s most populous city. Reopening economy attracting early investors.',
  ]},

  // ── Israel / Levant ───────────────────────────────────────────────────────
  { lngMin: 34.75, lngMax: 34.83, latMin: 32.05, latMax: 32.12, lines: [
    'Tel Aviv. Startup Nation capital. More VC-backed companies per capita than anywhere outside Silicon Valley.',
    'Tel Aviv beachfront. Mediterranean climate, tech millionaires, and apartment prices that rose 75% in five years.',
  ]},
  { lngMin: 35.20, lngMax: 35.24, latMin: 31.76, latMax: 31.80, lines: [
    'Jerusalem. Israel\'s proclaimed capital, holy to three religions. Tourism permanence and contentious jurisdiction.',
  ]},

  // ── Pakistan / Bangladesh ─────────────────────────────────────────────────
  { lngMin: 67.00, lngMax: 67.12, latMin: 24.84, latMax: 24.92, lines: [
    'Karachi. Pakistan\'s economic capital. Largest city in the country, port economy, and 15 million people.',
  ]},
  { lngMin: 90.35, lngMax: 90.43, latMin: 23.73, latMax: 23.79, lines: [
    'Dhaka. Bangladesh\'s capital and garment manufacturing epicentre. 22 million people, fastest-growing city in Asia.',
  ]},

]

// ── Country-level bbox narratives — pure coordinate lookup, no country string ─
// Each entry covers one country's approximate bounding box.
// Ordered so smaller/more specific countries come before large ones that overlap.
const COUNTRY_BBOX_NARRATIVES = [
  // Micro-states / tiny first
  { lngMin: 7.40, lngMax: 7.45, latMin: 43.72, latMax: 43.75, lines: ['Monaco. 2 sq km, the world\'s most densely populated sovereign state. Zero income tax, Formula 1, and the highest property prices in Europe.'] },
  { lngMin: 12.44, lngMax: 12.47, latMin: 43.90, latMax: 43.93, lines: ['San Marino. The world\'s oldest surviving republic, landlocked inside Italy at 700m altitude. Tourism, banking, and stamps.'] },
  { lngMin: 1.43, lngMax: 1.79, latMin: 42.43, latMax: 42.66, lines: ['Andorra. Duty-free mountain principality between France and Spain. 80,000 residents, ski resorts, and tobacco cheaper than anywhere in Europe.'] },
  { lngMin: 14.50, lngMax: 14.55, latMin: 35.85, latMax: 35.92, lines: ['Malta. Mediterranean island, EU member, English-speaking. Crypto regulation, iGaming licences, and Baroque fortresses on 316 sq km.'] },
  { lngMin: 6.00, lngMax: 6.19, latMin: 47.49, latMax: 47.82, lines: ['Luxembourg. The EU\'s richest state per capita. European Court of Justice, Amazon\'s EU HQ, and steel-town history turned finance.'] },
  // Belgium — before France/Netherlands/Germany to avoid overlap
  { lngMin: 2.52, lngMax: 6.40, latMin: 49.50, latMax: 51.50, lines: [
    'Belgium. 11 million people at the crossroads of Northern Europe. Antwerp\'s diamond trade, BASF\'s European HQ, and EU institutions headquartered in Brussels.',
    'Belgian countryside. Flat polder farmland, Flemish towns, and a chocolate and beer economy that punches above its size.',
    'Wallonia. French-speaking southern Belgium: Ardennes forests, Liège steel heritage, and EU structural funds rebuilding a post-industrial economy.',
    'Flanders. Dutch-speaking Belgium: Antwerp port (second largest in Europe), tech corridors, and agricultural land among the most productive in the EU.',
    'Ardennes plateau. Wooded highland crossing Belgium and Luxembourg: hiking, Trappist breweries, and the Bastogne battlefield.',
  ]},
  // Netherlands before Germany
  { lngMin: 3.36, lngMax: 7.23, latMin: 50.75, latMax: 53.58, lines: [
    'Netherlands. The world\'s second-largest agricultural exporter. Rotterdam handles 15% of all EU seaborne imports — the continent\'s gateway port.',
    'Dutch polder landscape. Land below sea level maintained by 17,000km of dikes: precision agriculture on some of the most intensively managed soil on Earth.',
    'Randstad. The ring of cities — Amsterdam, Rotterdam, Utrecht, The Hague — Europe\'s most productive 200km megalopolis by GDP density.',
    'Noord-Brabant. ASML, Philips origin, and DAF trucks: the Netherlands\' industrial south, quietly the most export-intensive region in the country.',
    'Groningen province. Natural gas fields that funded Dutch welfare for 50 years — and caused earthquakes that closed them. Transition underway.',
  ]},
  // Denmark before Scandinavia
  { lngMin: 8.09, lngMax: 15.20, latMin: 54.56, latMax: 57.76, lines: [
    'Denmark. Scandinavian kingdom, NATO member, and the world\'s largest wind turbine exporter. Maersk and Novo Nordisk headquartered in Copenhagen.',
    'Danish farmland. 60% of Denmark\'s land area is cultivated — pork, dairy, and barley on some of Europe\'s flattest and most productive soil.',
    'Jutland peninsula. The mainland: wind energy, port logistics, and Legoland country where quiet towns make things the world buys.',
    'Copenhagen metro. Denmark\'s capital and one of the most liveable cities in Europe — cycling infrastructure, design culture, and waterfront regeneration.',
  ]},
  // Ireland
  { lngMin: -10.50, lngMax: -6.00, latMin: 51.40, latMax: 55.40, lines: [
    'Ireland. EU member, English-speaking, 12.5% corporate tax. Apple, Google, Meta European HQs all here. GDP per capita overstated by multinational accounting.',
    'Irish countryside. Green Atlantic fields: beef and dairy on limestone plateau, backed by a diaspora that sends remittances and tourists.',
    'Dublin metro. Ireland\'s tech capital, where every major US platform employs thousands. Property prices hit new records every year.',
    'Connaught. The wild west: Galway, Connemara, the Aran Islands — thin soil on karst, Irish language, and a tourism economy worth billions.',
  ]},
  // Germany — before Austria and Switzerland (Munich lat 47.5 is in all three; Germany wins)
  { lngMin: 6.00, lngMax: 15.04, latMin: 47.27, latMax: 55.06, lines: [
    'Germany. Europe\'s largest economy. Bundesbank discipline, export manufacturing dominance, and a Rechtsstaat property rights framework.',
    'Bavaria. BMW, MAN, Siemens, and Allianz — Germany\'s wealthiest Land sits below Alpine foothills with medieval towns intact.',
    'Baden-Württemberg. Daimler, Bosch, SAP: the engineering heartland of the nation that built the global auto industry.',
    'North Rhine-Westphalia. Ruhr steel, Rhine ports, 18 million people — Germany\'s most populous Land, post-industrial and adapting.',
    'Brandenburg. The flat Mark around Berlin. Lakes, forests, and farmland repriced by Berliners fleeing city costs.',
    'Saxony. Dresden and Leipzig: East German cultural capitals whose property markets outpaced the national average for a decade.',
    'Rhineland. Roman foundations, wine valleys, and chemical industry along one of the world\'s busiest commercial waterways.',
    'Lower Saxony. Hanover, VW Wolfsburg, and coastal mudflats on the North Sea — industry and nature sharing flat Germanic terrain.',
    'Schleswig-Holstein. Denmark-adjacent flatland between two seas: wind farms, ferries, and farmland at Germany\'s northernmost fringe.',
  ]},
  // Switzerland — after Germany (lat 45.82–47.82 is below Germany\'s latMin 47.27, minimal overlap)
  { lngMin: 5.96, lngMax: 10.50, latMin: 45.82, latMax: 47.27, lines: [
    'Switzerland. The world\'s highest GDP per capita (PPP). Banking, pharma, watches — and property so expensive locals rent rather than buy.',
    'Swiss Plateau. The Mittelland: where 70% of 8.7 million Swiss live, between Jura limestone and Alpine glaciers.',
    'Valais. High Alpine valleys: vineyards at 600m, glaciers at 4,000m, ski resorts where wealth from 180 countries converges.',
    'Ticino. Italian-speaking Switzerland: Mediterranean climate north of the Alps and the cheapest property in the Confederation.',
    'Graubünden. The largest Swiss canton: Engadine valley, Davos Forum, and tri-lingual communities in Europe\'s most dramatic mountain landscape.',
  ]},
  // Austria — lat 46.37–48.99 with lng 9.53–17.16 (below Germany\'s latMin after adjustment)
  { lngMin: 9.53, lngMax: 17.16, latMin: 46.37, latMax: 47.27, lines: [
    'Austria. Alpine republic at the centre of Europe. Vienna\'s imperial legacy, Tyrolean ski resorts, and the EU\'s most tourism-dependent G-10 economy.',
    'Tyrol. Innsbruck and the Inn Valley: ski resorts from Kitzbühel to St. Anton, hydropower turbines, and Austrian precision manufacturing.',
    'Styria. The green heart of Austria: pumpkin seed oil, Lipizzaner horses, and a Graz tech cluster growing in Vienna\'s shadow.',
    'Burgenland. Pannonian lowland bordering Hungary: Blaufränkisch wine, storks on the rooftops, and the EU\'s largest wind farm cluster.',
  ]},
  // Austria east (Vienna and Salzburg area, higher lat)
  { lngMin: 12.00, lngMax: 17.16, latMin: 47.27, latMax: 48.99, lines: [
    'Austria. Alpine republic at the centre of Europe. Vienna\'s imperial legacy, Tyrolean ski resorts, and the EU\'s most tourism-dependent G-10 economy.',
    'Vienna surrounds. The Weinviertel and Burgenland: Lower Austria wine country stretching east from the capital towards Hungary.',
    'Salzburg. Mozart\'s birthplace, Festspiele, and mountain scenery — the most-photographed city in Austria.',
    'Styria. The green heart of Austria: pumpkin seed oil, Lipizzaner horses, and a Graz tech cluster growing in Vienna\'s shadow.',
  ]},
  // Spain — before France (Barcelona lat 43.13 is in both; Spain wins)
  { lngMin: -9.50, lngMax: 4.40, latMin: 35.98, latMax: 44.00, lines: [
    'Spain. Mediterranean climate, EU membership, and a real estate market that recovered strongly post-2014 and has not looked back.',
    'Andalusia. Eight million people: flamenco, olive oil, sherry, and a coast that Northern European pension money discovered in the 1960s.',
    'Castilian meseta. Dry plateau at 600–1000m: wheat, windmills, and medieval walled cities UNESCO-listed before the concept existed.',
    'Catalonia. Barcelona\'s hinterland: mountains, vineyards, and a €250bn regional economy with persistent separatist politics.',
    'Galicia. Atlantic Spain: granite, rain, Celtic music, and octopus — a corner of the peninsula that feels more like Ireland than Castile.',
    'Basque Country. Bilbao\'s Guggenheim bounce transformed one of Spain\'s wealthiest regions into Europe\'s premier industrial-city-as-cultural-destination.',
    'Canary Islands. Volcanic archipelago 100km off Africa. Year-round tourism and a tax regime that draws digital nomads from across the EU.',
    'Balearic Islands. Mallorca, Ibiza, Menorca: Mediterranean island property market where German and British buyers set the price ceiling.',
  ]},
  // Italy — before France (overlapping lng 6.63–9.60, lat 42–47; Italy wins)
  { lngMin: 6.63, lngMax: 18.52, latMin: 36.65, latMax: 47.09, lines: [
    'Italy. The world\'s eighth-largest economy. Fashion, design, food, and a property market that rewards patience over decades.',
    'Northern Italy. The industrial triangle Milan–Turin–Genoa: Europe\'s fourth-largest manufacturing cluster by output.',
    'Po Valley. Italy\'s breadbasket: flat, fertile, and criss-crossed by irrigation canals feeding a €35bn food export industry.',
    'Tuscany. Rolling hills, cypress avenues, and a wine-and-olive economy underpinning some of Italy\'s most sought-after rural property.',
    'Veneto. Venice\'s mainland: Verona, Padua, Vicenza — prosperous cities with Italy\'s second-highest regional GDP per capita.',
    'Emilia-Romagna. Ferrari, Lamborghini, Ducati, and Parmigiano — Italy\'s most productive region, built on artisan craftsmanship.',
    'Umbria. Green heart of Italy: hilltop towns, truffles, and Assisi — rural land half the price of Tuscany with identical terroir.',
    'Lazio. The Roman region beyond the Eternal City: volcanic lakes, ancient consular roads, and hill towns Michelangelo painted.',
    'Campania. Naples and the Amalfi Coast: volcanic fertility, pizza origin story, and poverty statistics that mask real estate demand.',
    'Sicily. The Mediterranean\'s largest island. Volcanic soil, Greek ruins, and a tourism economy growing faster than mainland Italy.',
    'Calabria. The toe of the boot: some of Europe\'s cheapest coastal property and the world\'s most biodiverse Mediterranean forest.',
    'Sardinia. Protected coastline, turquoise water, and the Costa Smeralda luxury corridor that Aga Khan built from nothing in 1962.',
  ]},
  // France — after Spain and Italy (catches remaining French territory)
  { lngMin: -5.20, lngMax: 9.60, latMin: 42.30, latMax: 51.10, lines: [
    'France. The world\'s seventh-largest economy and most visited country. Strong property rights, TGV network, and 35 UNESCO World Heritage Sites.',
    'French countryside. Farmland, chateaux, and village property that Northern Europeans have bought for generations.',
    'Loire Valley. UNESCO-listed chateau country, wine appellations, and an hour from Paris by high-speed rail.',
    'Provence. Lavender fields, olive groves, and a Mediterranean climate that draws Parisians and Londoners south every summer.',
    'Brittany. Atlantic coastline, granite farmhouses, and the lowest property prices in metropolitan France.',
    'Normandy. Apple orchards, dairy farms, and coastal villages — D-Day heritage and some of France\'s most stable rural land.',
    'Auvergne-Rhône-Alpes. Lyon\'s gastronomy, ski resorts from Chamonix to Courchevel, and pharma manufacturing in the Arve valley.',
    'Occitanie. Toulouse aerospace (Airbus HQ), Canal du Midi wine country, and Pyrenean foothills at the edge of Iberia.',
    'Pays de la Loire. Nantes, the Vendée coast, and the western Loire: Atlantic-facing farmland and a tech scene growing in Paris\'s shadow.',
  ]},
  // Portugal
  { lngMin: -9.50, lngMax: -6.19, latMin: 36.96, latMax: 42.16, lines: [
    'Portugal. 10 million people on the Atlantic edge of Europe. Wine, cork, tourism, and a Golden Visa programme that reshaped Lisbon\'s property market.',
    'Alentejo. The cork and olive heartland: rolling hills, latifundia farms, and some of the EU\'s cheapest farmland priced by local demand.',
    'Algarve. 300 days of sun and a golf resort economy that turned fishing villages into Northern Europe\'s retirement destination.',
    'Douro Valley. Port wine terraces on schist cliffs above the Douro River — UNESCO-listed landscape with the steepest mechanised viticulture in the world.',
    'Minho. Green, rainy northwest: Vinho Verde vines, granite farms, and a border with Spain older than either nation state.',
  ]},
  // United Kingdom
  { lngMin: -8.20, lngMax: 1.80, latMin: 49.90, latMax: 60.90, lines: [
    'United Kingdom. The world\'s fifth-largest economy. English law, centuries of property rights, and a planning system that has constrained supply for 80 years.',
    'England outside London. Market towns, commuter belts, and land that tracked London\'s rise at a structural discount.',
    'Yorkshire. Moors, dales, and steel-city heritage: a North–South property price divide that 40 years of policy have not closed.',
    'Scottish Highlands. Deer stalking, whisky distilleries, and crofting land in one of Europe\'s last genuine wildernesses.',
    'Wales. Slate mountains, sheep country, and a coastline backed by the lowest rural property prices in Great Britain.',
    'Northern Ireland. Post-Belfast Agreement stability, cross-border EU access, and property at a structural discount to the mainland.',
    'Cornwall and Devon. Atlantic peninsula: surf, cliffs, and a second-home premium that local communities have been challenging since the 1990s.',
  ]},
  // Scandinavia
  { lngMin: 4.00, lngMax: 31.00, latMin: 56.50, latMax: 71.20, lines: [
    'Scandinavia. The world\'s highest quality-of-life cluster. Norwegian oil, Swedish tech, Danish design, Finnish education — and fjords as the backdrop.',
    'Norwegian coast. Glacially carved fjords and North Sea oil wealth behind one of the world\'s largest sovereign wealth funds.',
    'Swedish Norrland. The empty north: boreal forest, iron ore, hydropower rivers, and a population density of 5 people per sq km.',
    'Finnish lakeland. 180,000 lakes in a forest nation where Nokia, Linux, and Angry Birds all originated.',
    'Danish farmland. 60% cultivated, flattest Scandinavian country, and pig exports that make Denmark the world\'s largest pork exporter per capita.',
  ]},
  // Finland
  { lngMin: 20.00, lngMax: 31.60, latMin: 59.80, latMax: 70.10, lines: [
    'Finland. Nordic republic, NATO member since 2023, birthplace of Linux and the sauna. 188,000 lakes and the world\'s best-performing education system.',
    'Finnish lakeland. 180,000 lakes in a boreal forest nation — summer cottages here are a constitutional right of the psyche.',
    'Lapland. Arctic Finland: reindeer herding, Northern Lights, and Santa Claus tourism generating more GDP per capita than the mines.',
  ]},
  // Poland
  { lngMin: 14.12, lngMax: 24.15, latMin: 49.00, latMax: 54.84, lines: [
    'Poland. Central Europe\'s largest economy. EU structural funds, skilled labour, and a manufacturing base that caught a wave of German outsourcing.',
    'Masovian plain. Warsaw\'s hinterland: grain fields and river valleys on the flattest country in Europe.',
    'Lesser Poland. Kraków\'s region: medieval heritage, salt mines, and a tech cluster built on Jagiellonian University graduates.',
    'Silesia. The old coal country pivoting to logistics hubs and BMW and Mercedes component factories.',
    'Warmia-Mazuria. The land of a thousand lakes: glacial landscape, rural depopulation, and growing eco-tourism.',
  ]},
  // Czech Republic
  { lngMin: 12.09, lngMax: 18.87, latMin: 48.55, latMax: 51.06, lines: [
    'Czech Republic. Central Europe\'s most industrialised economy per capita. Beer, Skoda, and a manufacturing base tied to German supply chains.',
    'Bohemian basin. Hops, carp ponds, and Baroque towns — a landlocked country that brews 160 litres of beer per person per year.',
    'Moravia. The wine-growing east: Riesling on limestone slopes and a capital, Brno, that costs half of Prague.',
  ]},
  // Slovakia
  { lngMin: 16.84, lngMax: 22.56, latMin: 47.73, latMax: 49.61, lines: [
    'Slovakia. Central European EU member with the highest per-capita car production in the world. Volkswagen, Kia, Peugeot — all assembling here.',
    'Slovak Carpathians. Mountain spine with ski resorts, spa towns, and Bratislava: a capital city 60km from Vienna that priced at half the premium.',
  ]},
  // Hungary
  { lngMin: 16.11, lngMax: 22.90, latMin: 45.74, latMax: 48.59, lines: [
    'Hungary. Landlocked Central European middle power. Thermal baths, Tokaj wine, and a government that became the EU\'s test case for illiberal democracy.',
    'Great Hungarian Plain. The Puszta: flat wind-swept steppe turned wheat field. Magyar horse culture and paprika peppers on the same land.',
    'Lake Balaton. Central Europe\'s largest lake: summer resort for Hungarian and Austrian families since the Habsburg era.',
  ]},
  // Romania
  { lngMin: 20.26, lngMax: 29.77, latMin: 43.62, latMax: 48.27, lines: [
    'Romania. 19 million people, the EU\'s second-largest Eastern European country. Wheat, oil, IT outsourcing, and a brain drain that removed 4 million people.',
    'Transylvania. Carpathian plateau: Saxon towns, medieval walls, Dracula tourism, and one of Europe\'s largest brown bear populations.',
    'Walachia. Bucharest\'s plain: sunflower oil, wheat, and a capital city growing faster than its infrastructure.',
    'Danube Delta. 5,800 sq km of wetland: Europe\'s most biodiverse delta, UNESCO biosphere, and 15,000 breeding pelicans.',
  ]},
  // Bulgaria
  { lngMin: 22.36, lngMax: 28.63, latMin: 41.23, latMax: 44.22, lines: [
    'Bulgaria. EU\'s poorest member state, but the fastest-growing IT sector in Eastern Europe. Black Sea resorts, rose oil, and retirement migration from Western Europe.',
    'Thracian plain. Wheat, sunflowers, and wine grapes between Plovdiv and the Black Sea coast.',
    'Rhodope Mountains. Bulgarian-Greek borderland: tobacco villages, ski resorts, and a wolf population recovering under EU nature protection.',
  ]},
  // Greece
  { lngMin: 20.15, lngMax: 26.61, latMin: 35.00, latMax: 41.75, lines: [
    'Greece. 11 million people, 16,000km of coastline, and a debt crisis that remade European fiscal politics for a decade.',
    'Greek islands. Mykonos to Rhodes: tourism-dependent archipelago where property prices reflect Athenian flight capital and Northern European second homes.',
    'Thessaly. Greece\'s breadbasket: cotton, wheat, and tomatoes on the Larissa plain, the most fertile region of a mountainous country.',
    'Macedonia region. Thessaloniki\'s hinterland: peach orchards, wine, and a city that was once the Byzantine Empire\'s second capital.',
    'Peloponnese. The southern peninsula: olive oil, currants, ancient Sparta ruins, and coastal property that Northern Europeans are rediscovering.',
  ]},
  // Serbia / Western Balkans
  { lngMin: 18.82, lngMax: 22.99, latMin: 42.23, latMax: 46.19, lines: [
    'Serbia. Largest Western Balkans economy, EU candidate. Belgrade is emerging as Southeast Europe\'s tech and nightlife capital.',
    'Vojvodina. Northern Serbia\'s breadbasket: sunflowers, corn, and Danube-irrigated flatland — some of Europe\'s cheapest productive farmland.',
  ]},
  // Croatia
  { lngMin: 13.50, lngMax: 19.45, latMin: 42.37, latMax: 46.55, lines: [
    'Croatia. EU member since 2013, Eurozone since 2023. Adriatic coast with 1,244 islands and a tourism economy rivalling Greece for Northern European spend.',
    'Dalmatian coast. Split, Dubrovnik, Hvar: stone-city Mediterranean coastline that generates 20% of Croatian GDP in three summer months.',
  ]},
  // Ukraine
  { lngMin: 22.13, lngMax: 40.23, latMin: 44.39, latMax: 52.38, lines: [
    'Ukraine. Europe\'s largest country within its borders. Black earth chernozem covering 30% of global topsoil reserves — the world\'s breadbasket.',
    'Kyiv region. The capital and surrounding oblast: government, finance, and a tech sector that produced hundreds of startups before 2022.',
    'Lviv region. Western Ukraine: Hapsburg architecture, EU-facing economy, and the fastest property market growth in the country\'s prewar west.',
    'Odessa oblast. Black Sea coast: grain export terminals, Potemkin Stairs, and a port city that has changed empires six times.',
    'Donbas. Industrial heartland and active conflict zone: coal, steel, and a war that has reshaped European security.',
  ]},
  // Belarus
  { lngMin: 23.17, lngMax: 32.78, latMin: 51.26, latMax: 56.17, lines: [
    'Belarus. Landlocked Eastern European republic under Lukashenko. Potash mines, tractor factories, and a border that separates two Europes.',
    'Polesia. The marshland: Europe\'s largest wetland system stretching into Ukraine and Poland — peat bogs, rivers, and Chernobyl exclusion zone nearby.',
  ]},
  // Baltic States
  { lngMin: 21.00, lngMax: 28.20, latMin: 53.90, latMax: 59.70, lines: [
    'Baltic states. Estonia, Latvia, Lithuania: three EU and NATO members, digital government pioneers, and the fastest property market risers in Eastern Europe.',
    'Lithuanian farmland. Amber coast, rye fields, and Vilnius fintech ecosystem building on a Baltic-rim advantage.',
    'Latvian countryside. Riga\'s Art Nouveau and Latvian song festival country. Forest covers 54% of the land — timber is the second export.',
    'Estonian digital republic. E-residency, X-Road, and Tallinn\'s medieval old town: the most digitally governed country in the world.',
  ]},
  // Russia (European part)
  { lngMin: 27.00, lngMax: 60.00, latMin: 50.00, latMax: 70.00, lines: [
    'Russia. The world\'s largest country. Hydrocarbons, minerals, and timber — much of it under sanctions-era conditions.',
    'European Russia. Volga region, Urals, and the Black Earth belt: wheat, sunflowers, and oil deposits west of the Ural watershed.',
    'Krasnodar Krai. Russia\'s Riviera: Black Sea coast, wheat fields, and the only subtropical climate in the Russian Federation.',
    'Volga region. Russia\'s agricultural heartland: wheat, sunflowers, and river trade on the longest river in Europe.',
  ]},
  // Siberia
  { lngMin: 60.00, lngMax: 141.00, latMin: 50.00, latMax: 75.00, lines: [
    'Siberia. Permafrost over oil fields larger than most countries. Russia\'s resource extraction zone and the world\'s largest contiguous wilderness.',
    'West Siberian plain. The world\'s largest swamp — also the largest conventional oil province. Gazprom pipelines visible from orbit.',
    'East Siberian taiga. Larch forests, mammoth tusk excavations, and rivers draining north into a warming Arctic Ocean.',
    'Russian Far East. Pacific-facing taiga: tigers, salmon, gold, and a border with China geographers call the world\'s most asymmetric.',
  ]},
  // Turkey
  { lngMin: 25.66, lngMax: 44.82, latMin: 35.82, latMax: 42.14, lines: [
    'Turkey. A country straddling two continents. 85 million people, NATO membership, and an economy swinging between boom and lira-crisis.',
    'Anatolian plateau. Wheat, livestock, and salt lakes on a high plain surrounded by mountain ranges on three sides.',
    'Turkish Aegean coast. Bodrum, Izmir, Cesme — turquoise coves, olive groves, and coastal property priced for European buyers.',
    'Black Sea coast. Hazelnut orchards, tea fields, and fishing ports in Turkey\'s rainiest and greenest corner.',
    'Southeast Anatolia. GAP project irrigation, Kurdish majority cities, and land contested since the Bronze Age.',
  ]},
  // Israel
  { lngMin: 34.27, lngMax: 35.90, latMin: 29.49, latMax: 33.34, lines: [
    'Israel. Startup Nation. More NASDAQ-listed companies per capita than any country outside the US. Mediterranean coast, desert, and permanent security premium.',
    'Negev desert. 60% of Israel\'s land area: solar farms, Ramon Crater tourism, and Ben-Gurion\'s dream of making the desert bloom — partially achieved.',
    'Galilee. Northern Israel: Druze villages, Kinneret shore, wine country, and tech parks in Nazareth and Haifa.',
  ]},
  // Saudi Arabia
  { lngMin: 36.70, lngMax: 55.70, latMin: 16.38, latMax: 32.16, lines: [
    'Saudi Arabia. The world\'s largest oil exporter and custodian of Mecca and Medina. Vision 2030 is betting on tourism to replace petroleum revenue.',
    'Hejaz. The Red Sea coast: Jeddah, Mecca, Medina — the commercial and religious heartland of the Arab world.',
    'Rub al-Khali. The Empty Quarter: the world\'s largest continuous sand desert, mostly oil-bearing, completely uninhabited.',
    'Asir mountains. Southwestern highlands: terraced farms, juniper forests, and summer temperatures 20°C below Riyadh.',
  ]},
  // UAE
  { lngMin: 51.56, lngMax: 56.40, latMin: 22.63, latMax: 26.09, lines: [
    'UAE. Seven emirate federation with the world\'s most ambitious urban construction programme. Zero income tax, zero capital gains, English common law in DIFC.',
    'Sharjah and Northern Emirates. Dubai\'s affordable neighbour: manufacturing, ceramics, and a emirate that banned alcohol — the opposite of everything south of it.',
    'Ras al-Khaimah and Fujairah. UAE\'s quieter corners: mountain roads, wadis, and a cement industry built on Hajar Mountain limestone.',
  ]},
  // Qatar
  { lngMin: 50.75, lngMax: 51.65, latMin: 24.56, latMax: 26.18, lines: [
    'Qatar. World\'s highest GDP per capita (nominal). LNG wealth concentrated in a peninsula the size of Connecticut. World Cup infrastructure permanent.',
    'Qatar interior. Inland sabkha and sand: largely uninhabited, with camel racing and falconry on the fringes of Doha\'s urban sprawl.',
  ]},
  // Kuwait
  { lngMin: 46.55, lngMax: 48.44, latMin: 28.53, latMax: 30.10, lines: [
    'Kuwait. Tiny Gulf emirate with the world\'s sixth-largest oil reserves. Kuwait Investment Authority holds $750bn in sovereign assets.',
  ]},
  // Iraq
  { lngMin: 38.79, lngMax: 48.60, latMin: 29.06, latMax: 37.39, lines: [
    'Iraq. Mesopotamia: the Tigris and Euphrates delta, OPEC\'s second-largest producer, and a reconstruction economy 20 years on.',
    'Kurdistan Region. Northern Iraq: autonomous, oil-wealthy, relatively stable, and competing with Baku and Dubai for regional investment.',
  ]},
  // Iran
  { lngMin: 44.03, lngMax: 63.33, latMin: 25.06, latMax: 39.78, lines: [
    'Iran. 88 million people, world\'s fourth-largest oil reserves, and a sanctions-isolated economy of extraordinary resilience.',
    'Iranian plateau. Arid interior ringed by mountains: pistachio and saffron farms in valleys watered by ancient qanats.',
    'Caspian coast. Alborz mountains meet a humid subtropical shore: tea, rice, and the only truly green landscape in Iran.',
    'Persian Gulf coast. Khuzestan oil fields and the Strait of Hormuz — geography that makes Iran a global energy chokepoint.',
  ]},
  // Pakistan
  { lngMin: 60.87, lngMax: 77.84, latMin: 23.69, latMax: 37.10, lines: [
    'Pakistan. 230 million people, a nuclear state, and an economy cycling through IMF programmes. Cotton, textiles, and China-Pakistan Economic Corridor.',
    'Indus plain. Punjab and Sindh: irrigated wheat and cotton on the Indus River system feeding 150 million people.',
    'Khyber Pakhtunkhwa. The tribal frontier: passes to Afghanistan, marble quarries, and gemstone mines in Hindu Kush foothills.',
    'Balochistan. Largest province by area, smallest by population: copper, gold, gas, and strategic coastline on the Arabian Sea.',
  ]},
  // India
  { lngMin: 68.18, lngMax: 97.41, latMin: 8.07, latMax: 37.10, lines: [
    'India. 1.4 billion people, the fastest-growing major economy. An urbanisation wave still in its early innings — cities building infrastructure for a billion more.',
    'Gangetic plain. The Ganges basin: 500 million people on alluvial soil that has fed the subcontinent for 5,000 years.',
    'Deccan plateau. India\'s manufacturing interior: Pune, Hyderabad, Bengaluru — the cities building India\'s tech economy.',
    'Rajasthan. Desert kingdom turned solar superpower and tourist magnet: palaces, forts, and camel country.',
    'Kerala backwaters. Tropical coast, highest literacy rate in India, and a remittance economy funded by 3 million Keralites in the Gulf.',
    'Northeast India. Seven sister states: hills, tea estates, and rivers draining into Bangladesh at the subcontinent\'s forgotten edge.',
    'Gujarat. India\'s most business-friendly state: ports, petrochemicals, diamonds, and the origins of the Tata and Ambani dynasties.',
    'Jharkhand and Chhattisgarh. Tribal heartland: coal, iron ore, and manganese beneath some of India\'s last intact forests.',
  ]},
  // Bangladesh
  { lngMin: 88.01, lngMax: 92.68, latMin: 20.74, latMax: 26.63, lines: [
    'Bangladesh. 170 million people on a Bengal Delta the size of Greece. The world\'s second-largest garment exporter after China.',
    'Chittagong hills. Bangladesh\'s only non-flat terrain: tea estates, tribal communities, and ship-breaking yards on the estuary coast.',
    'Sylhet. Tea garden country: lush emerald hills and the origin point of Britain\'s Bangladeshi diaspora.',
  ]},
  // Sri Lanka
  { lngMin: 79.65, lngMax: 81.88, latMin: 5.92, latMax: 9.84, lines: [
    'Sri Lanka. Island nation recovering from a 2022 economic crisis. Tea, tourism, and a port position at the centre of Indian Ocean shipping lanes.',
    'Sri Lankan highlands. The tea country: Nuwara Eliya and Ella at 1,800m — Ceylon tea from misty gardens that Victorian planters planted in 1867.',
  ]},
  // Myanmar
  { lngMin: 92.18, lngMax: 101.17, latMin: 9.78, latMax: 28.55, lines: [
    'Myanmar. Teak forests, jade mines, Ruby deposits — extraordinary resource wealth in a country experiencing sustained political crisis.',
    'Irrawaddy Delta. Rice paddy heartland feeding 55 million people on alluvial deposits from Himalayan glaciers.',
    'Shan Plateau. Highland Myanmar: poppy fields giving way to tea, tomatoes, and rare-earth minerals beneath a complex mosaic of ethnic territories.',
  ]},
  // Thailand
  { lngMin: 97.34, lngMax: 105.64, latMin: 5.61, latMax: 20.46, lines: [
    'Thailand. 70 million people, world\'s largest rice exporter, and a tourist economy worth 20% of GDP in good years.',
    'Chao Phraya basin. The Central Plains: rice paddies and shrimp farms feeding a country that exports 10 million tonnes of rice annually.',
    'Northern highlands. Chiang Rai and Chiang Mai: hill tribe villages, specialty coffee, and cooler temperatures drawing retirees from Bangkok.',
    'Southern peninsula. Rubber and palm oil above ground, tin below — with beach tourism on both Andaman Sea and Gulf of Thailand coasts.',
  ]},
  // Vietnam
  { lngMin: 102.14, lngMax: 109.47, latMin: 8.18, latMax: 23.39, lines: [
    'Vietnam. 98 million people, 30 years of Doi Moi reform, and a manufacturing economy absorbing work fleeing China\'s wage inflation.',
    'Mekong Delta. The rice bowl: nine-armed delta producing 50% of Vietnam\'s rice and 90% of its fruit exports.',
    'Red River Delta. Hanoi\'s plain: densely cultivated, densely populated, and the cradle of Vietnamese civilisation.',
    'Central Highlands. Buon Ma Thuot: the coffee capital of the world\'s second-largest coffee exporter.',
    'Da Nang coast. 30km of beach between Marble Mountains and lagoon: the fastest-growing tourist destination in Southeast Asia.',
  ]},
  // Cambodia / Laos
  { lngMin: 100.09, lngMax: 107.65, latMin: 9.96, latMax: 22.52, lines: [
    'Mekong mainland. Cambodia, Laos: Angkor Wat heritage, hydropower dams, and an agricultural frontier opening up to Vietnamese and Chinese investment.',
    'Cambodian plains. The Tonlé Sap lake system: seasonal floodplain agriculture sustaining 17 million people on fish and rice.',
  ]},
  // Malaysia (Peninsula)
  { lngMin: 99.64, lngMax: 104.39, latMin: 1.26, latMax: 6.72, lines: [
    'Malaysia. 33 million people, palm oil, rubber, and a semiconductor supply chain that makes the world\'s laptops run.',
    'Malaysian Peninsula. Kuala Lumpur to Johor Bahru: urban spine with rubber estates, palm oil, and electronics manufacturing parks.',
    'Pahang interior. The peninsular jungle: Cameron Highlands tea, Taman Negara rainforest, and gold mines under forest reserve.',
  ]},
  // Malaysian Borneo
  { lngMin: 109.57, lngMax: 119.27, latMin: 0.85, latMax: 7.38, lines: [
    'Malaysian Borneo. Sabah and Sarawak: rainforest, orang-utans, liquefied natural gas, and timber — sometimes all four on the same concession.',
    'Sarawak interior. The Iban longhouse corridor: Borneo jungle communities between logging roads and LNG pipelines.',
  ]},
  // Indonesia (Java and Sumatra)
  { lngMin: 95.01, lngMax: 119.00, latMin: -8.78, latMax: 5.91, lines: [
    'Indonesia. 270 million people across 17,000 islands. World\'s largest Muslim-majority nation and fourth-largest country by population.',
    'Java. 150 million people on an island smaller than California: volcanoes, rice terraces, and the industrial corridor from Jakarta to Surabaya.',
    'Sumatra. Palm oil, rubber, coffee, and Aceh: Indonesia\'s westernmost province rebuilt after the 2004 tsunami.',
    'Kalimantan. Indonesian Borneo: palm oil, coal, nickel, and Nusantara — the new capital rising from the rainforest.',
  ]},
  // Philippines
  { lngMin: 116.93, lngMax: 126.60, latMin: 4.59, latMax: 21.12, lines: [
    'Philippines. 115 million people across 7,600 islands. BPO capital of the world and the Pacific\'s largest archipelago economy.',
    'Visayas. The central islands: rice and sugar on Negros, world-class diving on Cebu and Bohol, fishing across 2,000 islands.',
    'Mindanao. The southern island: pineapple, tuna, gold, and a Muslim-majority region with a 50-year peace process history.',
    'Luzon hinterland. Beyond Metro Manila: rice terraces in Ifugao, tobacco in Cagayan, and active volcanoes on the Pacific Ring of Fire.',
  ]},
  // China
  { lngMin: 73.68, lngMax: 134.77, latMin: 18.16, latMax: 53.56, lines: [
    'China. The world\'s second-largest economy. 1.4 billion consumers, state-directed infrastructure, and land ultimately owned by the state.',
    'Yangtze Delta. The richest river basin in Asia: Shanghai, Suzhou, Hangzhou — where China\'s middle class was invented.',
    'Pearl River Delta. Shenzhen–Guangzhou–Hong Kong: the factory floor that made cheap electronics a global norm.',
    'Manchuria. Rustbelt northeast: Soviet-era heavy industry, soybean plains, and a demographic collapse no policy has reversed.',
    'Xinjiang. Desert frontier: cotton, minerals, surveillance infrastructure, and geopolitically contested territory.',
    'Yunnan. Tropical mountains bordering Myanmar, Laos, and Vietnam: 50 million tourists a year from Lijiang to Dali.',
    'Hainan. China\'s Hawaii: tropical island free-trade zone, duty-free shopping, and a property market for Chinese citizens.',
    'Sichuan basin. Chengdu and Chongqing: 100 million people in an inland province growing faster than the coast.',
    'Chinese interior. Manufacturing relocating inland from coastal megacities — inland tiers catching up on decades of deferred investment.',
  ]},
  // Japan
  { lngMin: 129.65, lngMax: 145.82, latMin: 31.05, latMax: 45.52, lines: [
    'Japan. The world\'s third-largest economy. Precision manufacturing, cultural exports, and the yen as a perpetual safe-haven currency.',
    'Japanese countryside. Aging rural villages where properties sell for ¥1 — next to Shinkansen-connected cities worth millions.',
    'Hokkaido. Japan\'s northern island: dairy farming, powder skiing, and land so underpriced that foreign buyers have been snapping up farms.',
    'Kyushu. Japan\'s southernmost major island: automotive manufacturing, onsen resorts, and South Korea 200km across the strait.',
    'Tohoku. Northeast Honshu: rice paddies, sake breweries, and a reconstruction economy rebuilding 15 years after 2011.',
    'Chubu. Alpine heartland: Toyota City, Mount Fuji\'s flanks, and the Japan Alps between Tokyo and Osaka.',
  ]},
  // Taiwan
  { lngMin: 119.99, lngMax: 122.01, latMin: 21.90, latMax: 25.30, lines: [
    'Taiwan. Semiconductor superpower: TSMC alone produces 90% of the world\'s most advanced chips. A geopolitical risk premium baked into every transaction.',
    'Taipei basin. Taiwan\'s capital and tech hub. Mountain-ringed valley with hot springs, night markets, and the world\'s densest high-tech workforce.',
  ]},
  // South Korea
  { lngMin: 126.12, lngMax: 129.59, latMin: 34.00, latMax: 38.63, lines: [
    'South Korea. Semiconductors, K-pop, shipbuilding. The world\'s most wired country with the most competitive education system.',
    'Korean peninsula. Samsung, Hyundai, LG — three companies whose combined value rivals the GDP of a mid-sized European nation.',
    'Korean countryside. Manufacturing cluster cities, rice paddies, and ginseng farms in a mountainous peninsula.',
    'Gyeonggi province. Seoul\'s commuter belt: 13 million people in cities that grew faster than any planning system could absorb.',
    'Jeju Island. Volcanic island, UNESCO biosphere, and South Korea\'s domestic tourism and retirement capital.',
  ]},
  // Australia
  { lngMin: 113.34, lngMax: 153.64, latMin: -43.64, latMax: -10.69, lines: [
    'Australia. Vast continent, small population, enormous mineral wealth — and some of the world\'s most expensive urban property pinned to two coastlines.',
    'Australian outback. Iron ore, coal, and cattle on land so remote the nearest neighbour is 200km away.',
    'Queensland hinterland. Sugarcane, beef cattle, and coking coal seams beneath a landscape receiving 7 months of tropical sun.',
    'Western Australian interior. The Pilbara iron ore plateau: more minerals per square kilometre than anywhere outside the Congo.',
    'Murray-Darling basin. The food bowl: cotton, almonds, wine grapes, and a water rights dispute running for 40 years.',
    'Tasmania. Island state: wilderness, salmon farming, whisky distilleries, and property prices driven up by mainlanders buying remoteness.',
  ]},
  // New Zealand
  { lngMin: 166.43, lngMax: 178.55, latMin: -47.29, latMax: -34.39, lines: [
    'New Zealand. Two islands, 5 million people, and the most remote significant economy on Earth. Dairy, wine, geothermal energy, tourism.',
    'Canterbury plains. New Zealand\'s breadbasket: dairy and wheat on flat alluvial land drained by snow-fed rivers.',
    'Marlborough Sounds. The world\'s most complex drowned coastline at the top of the South Island. Sauvignon Blanc country.',
    'Northland. Subtropical tip of the North Island: kauri forests and the Bay of Islands where the Treaty of Waitangi was signed.',
  ]},
  // Morocco
  { lngMin: -13.17, lngMax: -1.00, latMin: 27.66, latMax: 35.93, lines: [
    'Morocco. The Arab world\'s most stable monarchy and the world\'s largest phosphate exporter. One hour from Europe by ferry.',
    'Atlantic plains. Casablanca\'s hinterland: irrigated wheat, market gardening, and a growing aerospace manufacturing cluster.',
    'High Atlas. The Berber heartland: saffron valleys, walnut groves, and mule tracks that have been trade routes for 2,000 years.',
    'Saharan fringe. Ouarzazate and the Draa Valley: date palms, kasbahs, and a film industry renting Morocco\'s desert to Hollywood.',
  ]},
  // Egypt
  { lngMin: 24.70, lngMax: 36.90, latMin: 21.98, latMax: 31.67, lines: [
    'Egypt. The Arab world\'s most populous country. 105 million people, the Suez Canal, and a real estate market tied to Gulf remittances.',
    'Nile Delta. The most densely populated agricultural land in Africa: rice, cotton, vegetables on Nile silt deposited for 5,000 years.',
    'Sinai Peninsula. Desert, coral reefs, and a tourism economy anchored by Sharm el-Sheikh and Dahab.',
    'Western Desert. The Sahara west of the Nile: oasis towns, oil exploration, and solar potential dwarfing Europe\'s installed capacity.',
  ]},
  // Ethiopia
  { lngMin: 33.00, lngMax: 47.98, latMin: 3.42, latMax: 14.90, lines: [
    'Ethiopia. 120 million people and the African Union headquarters. Coffee origin, highland agriculture, and a dam that upstream neighbours fear.',
    'Ethiopian highlands. The Roof of Africa: fertile plateaus at 2,000–3,000m, teff fields, and a climate that allowed civilisation without the coast.',
    'Afar triangle. Below sea level, above 50°C, and one of the world\'s most active volcanic rift zones.',
  ]},
  // Kenya
  { lngMin: 33.91, lngMax: 41.90, latMin: -4.68, latMax: 5.02, lines: [
    'Kenya. East Africa\'s largest economy. Nairobi tech hub, Mombasa port, and a tourism economy anchored by the Masai Mara.',
    'Rift Valley. Kenya\'s agricultural spine: tea, coffee, wheat, and flower farms exporting to Schiphol airport overnight.',
    'Northern Kenya. Arid pastoral territory: oil in Turkana county, wind power at Lake Turkana, and drought every three years.',
  ]},
  // South Africa
  { lngMin: 16.48, lngMax: 32.89, latMin: -34.83, latMax: -22.13, lines: [
    'South Africa. Africa\'s most industrialised economy. Gold, platinum, wine, and a real estate market priced for rand volatility.',
    'Karoo. Semi-desert plateau: sheep farming, shale gas potential, and 360-degree skies that draw astronomers.',
    'Garden Route. Coastal forest and fynbos between Mossel Bay and Storms River — a tourist corridor with the highest property premiums outside the metros.',
    'Limpopo. The bushveld: game reserves, citrus farms, platinum mines, and the Zimbabwe border.',
    'Free State. Wheat and sunflower country on the High Veld: the most productive agricultural province with the least glamour.',
  ]},
  // Nigeria
  { lngMin: 2.69, lngMax: 14.68, latMin: 4.27, latMax: 13.90, lines: [
    'Nigeria. Africa\'s largest economy. 220 million people, oil wealth, Nollywood, and a fintech ecosystem growing faster than anywhere on the continent.',
    'Niger Delta. The oil rivers: pipeline networks, mangrove swamps, and a resource curse that made the region wealthy in extraction and poor in development.',
    'Lagos hinterland. Africa\'s largest city sprawling into Ogun State — property prices that shocked investors into taking Africa seriously.',
    'North Nigeria. The Hausa–Fulani heartland: Sahel pasture, groundnuts, and Kano\'s ancient leather and textile trade.',
  ]},
  // Ghana
  { lngMin: -3.26, lngMax: 1.20, latMin: 4.74, latMax: 11.18, lines: [
    'Ghana. West Africa\'s most stable democracy. Gold, cocoa, and oil — three commodities that have taken turns growing the economy.',
    'Ashanti Region. Kumasi and the cocoa belt: the world\'s richest cacao-growing soil around Ghana\'s second city.',
    'Volta Region. The lake behind Akosombo Dam: hydropower, tilapia farming, and one of Africa\'s largest man-made reservoirs.',
  ]},
  // Brazil
  { lngMin: -73.99, lngMax: -29.35, latMin: -33.75, latMax: 5.27, lines: [
    'Brazil. South America\'s largest economy. 215 million people, extraordinary biodiversity, and a commodity export machine.',
    'Cerrado. The Brazilian savanna being converted to soy farms: the world\'s fastest land-use change outside the Amazon.',
    'Amazon rainforest. The world\'s largest carbon sink. Deforestation pressure from cattle ranching and soy is accelerating.',
    'Brazilian northeast. Fortaleza, Recife, Salvador: semi-arid hinterland with tourism coast and poverty rates double the south.',
    'São Paulo state interior. Sugarcane, oranges, and the world\'s largest flex-fuel vehicle fleet on Brazil\'s richest agricultural land.',
    'Rio Grande do Sul. Brazil\'s gaucho south: European immigrant towns, wine, soy, and a climate unlike the tropics.',
  ]},
  // Argentina
  { lngMin: -73.58, lngMax: -53.64, latMin: -55.06, latMax: -21.78, lines: [
    'Argentina. South America\'s second-largest economy. Beef, soy, lithium — and a peso in structural crisis for 80 years.',
    'Pampas. The world\'s most fertile temperate grassland: 60 million cattle and soy exports that fed half of Asia\'s growth.',
    'Patagonia. Wind-scoured steppe and Andean glaciers: tourism, sheep, oil, and land bought by foreigners at prices locals resent.',
    'Mendoza wine country. Malbec on alluvial fans at 700m altitude: Andes snowmelt irrigating a wine economy that competes globally.',
  ]},
  // Chile
  { lngMin: -75.64, lngMax: -66.96, latMin: -55.98, latMax: -17.50, lines: [
    'Chile. The world\'s longest country. Atacama copper, Patagonia ice, and Pacific coast anchored by the most stable institutions in Latin America.',
    'Atacama Desert. The driest non-polar place on Earth: copper mines, lithium brines, and the world\'s clearest astronomical skies.',
    'Central Valley. Wine country: Maipo, Colchagua, Casablanca — Andes melt water irrigating Cabernet at scale.',
    'Chiloé. Archipelago of wooden churches, salmon farms, and myths where the Pacific swallows the continent.',
  ]},
  // Colombia
  { lngMin: -79.00, lngMax: -66.88, latMin: -4.23, latMax: 12.44, lines: [
    'Colombia. South America\'s fourth-largest economy. Coffee, flowers, coal, and a peace dividend unlocking tourism and FDI.',
    'Colombian coffee region. Eje Cafetero: steep volcanic hillsides at 1,500m producing Arabica beans UNESCO-listed as cultural heritage.',
    'Llanos. The eastern plains: cattle ranching and oil extraction on a flat savanna the size of France.',
    'Pacific coast. The Chocó: the world\'s highest rainfall and most biodiverse rainforest, with near-zero infrastructure.',
  ]},
  // Peru
  { lngMin: -81.33, lngMax: -68.67, latMin: -18.35, latMax: -0.04, lines: [
    'Peru. The world\'s second-largest copper producer and birthplace of the potato. Andean highlands, Amazon jungle, coastal desert.',
    'Peruvian Amazon. Loreto and Ucayali: 60% of Peru\'s land area, 5% of its population, and 10% of Amazonian biodiversity.',
    'Andean highlands. Cusco to Puno: Inca stonework above 3,400m where quinoa and potatoes evolved together.',
    'Coastal desert. One of the driest places on Earth, irrigated by Andean snowmelt to grow asparagus for European supermarkets.',
  ]},
  // Venezuela
  { lngMin: -73.35, lngMax: -59.81, latMin: 0.65, latMax: 12.20, lines: [
    'Venezuela. The world\'s largest proven oil reserves and a humanitarian crisis of equal scale. Extraordinary geography, extraordinary dysfunction.',
    'Orinoco belt. The heavy oil deposits beneath the delta: reserves larger than Saudi Arabia, with extraction economics that only make sense above $50/barrel.',
    'Venezuelan Andes. Coffee towns and colonial cities at altitude — a Venezuela that tourism might have reached if the political trajectory had been different.',
  ]},
  // Mexico
  { lngMin: -117.15, lngMax: -86.71, latMin: 14.53, latMax: 32.72, lines: [
    'Mexico. The world\'s 15th-largest economy. Nearshoring boom, USMCA trade flows, and a real estate market mispriced for its fundamentals.',
    'Baja California. Desert peninsula: Tijuana manufacturing, Los Cabos tourism, and a property market dollarised by American retirees.',
    'Yucatan Peninsula. Mayan ruins, cenotes, and a tourism economy pivoting from Cancun to Tulum at speed.',
    'Guadalajara metro. Mexico\'s Silicon Valley: software, tequila distilleries, and a middle class that grew 40% in a decade.',
    'Oaxaca. Mountain state with sixteen indigenous groups, mezcal production, and a creative economy drawing Mexico City expats.',
  ]},
  // USA (broad)
  { lngMin: -125.00, lngMax: -65.00, latMin: 24.50, latMax: 49.50, lines: [
    'United States. The world\'s largest economy with the deepest and most liquid real estate market globally.',
    'American interior. Vast land, cheap by coastal standards, anchored by agricultural output and industrial legacy.',
    'US sunbelt. The fastest-growing population corridor: no state income tax, cheap land, rising demand, and a climate that no amount of AC debate will reverse.',
    'US mountain west. Remote, resource-rich, and increasingly sought after as remote work untethers people from coastal cities.',
    'Great Plains. The world\'s grain basket: wheat and corn on some of the most productive arable land on the planet.',
    'Pacific Northwest. Evergreen forests, volcanic peaks, and a tech economy that pushed Seattle housing past San Francisco parity.',
    'Rust Belt. Detroit to Pittsburgh: post-industrial cities where property is cheap and urban revival is uneven but real.',
    'New England. Colonial towns, Ivy League universities, and a tourism economy built on autumn foliage and maritime history.',
  ]},
  // Canada (broad)
  { lngMin: -141.00, lngMax: -52.62, latMin: 41.68, latMax: 83.11, lines: [
    'Canada. The world\'s second-largest country by area. Vast resource wealth, stable institutions, and two overpriced coastal cities.',
    'Canadian Shield. Granite, boreal forest, freshwater, and minerals. Sparsely populated and unlikely to change.',
    'Prairie provinces. Alberta oil, Saskatchewan wheat, Manitoba cattle: the resource base of a trillion-dollar economy.',
    'British Columbia interior. Mountains, mining, and rivers draining into the Pacific. Timber wealth and ski resort real estate.',
    'Quebec. French Canada: distinct culture, strong institutions, and property markets that diverged from Ontario a decade ago.',
    'Atlantic Canada. Nova Scotia, New Brunswick, PEI — fishing, forestry, and the cheapest coastal property in North America.',
    'Canadian Arctic. Permafrost, mineral rights, and the world\'s longest undefended coastline opening up as ice retreats.',
  ]},
]

// ── Legacy: COUNTRY_NARRATIVES kept for reference but no longer used in lookup ─
const COUNTRY_NARRATIVES = {
  'France': [
    'France. The world\'s 7th largest economy and most visited country. 67 million people, strong property rights.',
    'French countryside. Farmland, chateaux, and village property that northern Europeans have bought for generations.',
    'Regional France. TGV-connected medium cities offer Paris-level institutions at a fraction of Paris-level prices.',
    'Loire Valley. UNESCO-listed chateau country, wine appellations, and an hour from Paris by high-speed rail.',
    'Provence. Lavender fields, olive groves, and a climate that draws Parisians and Londoners south every summer.',
    'Brittany. Atlantic coastline, granite architecture, and seafood-driven tourism at the far northwest of continental Europe.',
    'Bordeaux hinterland. Premier Cru vineyards and the Gironde estuary — land here trades at wine-commodity premiums.',
    'Normandy. Apple orchards, dairy farms, and coastal villages rebuilt after 1944 on what is now some of France\'s most stable rural land.',
  ],
  'Italy': [
    'Italy. The world\'s 8th largest economy. Fashion, design, food, and a real estate market that rewards patience.',
    'Italian countryside. Tuscany, Umbria, and the Po Valley — agricultural land priced on local demand, not foreign fantasy.',
    'Northern Italy. The industrial triangle of Milan–Turin–Genoa: Europe\'s fourth-largest manufacturing cluster.',
    'Po Valley. Italy\'s breadbasket. Flat, fertile, and criss-crossed by irrigation canals feeding a €35bn food export industry.',
    'Tuscany. Rolling hills, cypress avenues, and a wine-and-olive economy underpinning some of Italy\'s most sought-after rural property.',
    'Veneto. Venice\'s mainland: Verona, Padua, Vicenza — prosperous small cities with one of Italy\'s highest GDP per capita.',
    'Emilia-Romagna. Ferrari, Lamborghini, Ducati, and Parmigiano — Italy\'s most productive region, built on craftsmanship.',
    'Sicily. The Mediterranean\'s largest island. Volcanic soil, Greek ruins, and a tourism economy growing faster than the Italian average.',
    'Calabria. The toe of the boot. Underdeveloped by Italian standards, with some of Europe\'s cheapest coastal property.',
    'Sardinia. Protected coastline, clear water, and a tourist economy anchored by the Costa Smeralda luxury corridor.',
  ],
  'Germany': [
    'Germany. Europe\'s largest economy. Bundesbank discipline, manufacturing export dominance, and stable Rechtsstaat.',
    'German countryside. Mittelstand factory towns and agricultural land in Europe\'s most reliable economic base.',
    'Bavaria. BMW, MAN, Siemens — and medieval towns amid Alpine foothills. Germany\'s wealthiest Land by GDP per capita.',
    'Baden-Württemberg. Daimler, Bosch, SAP: the engineering heartland of a nation that built the global auto industry.',
    'North Rhine-Westphalia. Ruhr steel, Rhine ports, and 18 million people — Germany\'s most populous and most post-industrial Land.',
    'Brandenburg. The flat mark around Berlin. Forests, lakes, and agricultural land repriced by Berliners fleeing city costs.',
    'Saxony. Dresden and Leipzig — East German cultural capitals whose property markets have outpaced the national average for a decade.',
    'Rhineland. Roman foundations, wine valleys, and chemical industry along one of the world\'s busiest commercial waterways.',
  ],
  'Spain': [
    'Spain. Mediterranean climate, EU membership, and a real estate market that recovered strongly post-2014.',
    'Spanish coast. Andalusia to Costa Brava — where Northern European pension money has parked itself for 50 years.',
    'Castilian meseta. Dry plateau at 600–1000m: wheat, windmills, and medieval walled cities UNESCO-listed for good reason.',
    'Andalusia. Eight million people, flamenco, olive oil, and sherry on a land mass bigger than Portugal.',
    'Catalonia. Barcelona\'s hinterland: mountains, vineyards, and a €250bn regional economy with persistent separatist politics.',
    'Valencia. Spain\'s third-largest city, citrus groves, and paella country on the Mediterranean\'s western shore.',
    'Galicia. Atlantic Spain: granite, rain, Celtic music, and octopus — a corner of the peninsula that feels more like Ireland than Castile.',
    'Canary Islands. Volcanic archipelago off the African coast. Year-round tourism and a tax regime that draws digital nomads.',
    'Basque Country. ETA\'s shadow is long gone. Bilbao\'s Guggenheim bounce turned one of Spain\'s wealthiest regions into a cultural destination.',
  ],
  'United Kingdom': [
    'United Kingdom. The world\'s fifth-largest economy. English law, stable institutions, and centuries of property rights.',
    'British countryside. Rolling agricultural land in one of the world\'s most densely regulated planning systems.',
    'England outside London. Market towns, commuter belts, and land that tracked London\'s rise at a discount.',
    'Yorkshire. Moors, dales, and steel-city heritage: land prices here reflect the North–South divide that decades of policy haven\'t closed.',
    'Scottish Highlands. Deer stalking, whisky distilleries, and crofting land in one of Europe\'s last genuine wildernesses.',
    'Wales. Slate mountains, sheep country, and a coastline backed by the lowest rural property prices in Great Britain.',
    'Northern Ireland. Post-Belfast Agreement stability, cross-border trade access, and property at a structural discount to mainland Britain.',
    'Cornwall and Devon. Atlantic peninsula: surf, cliffs, and a second-home premium that locals have been protesting since the nineties.',
  ],
  'United States': [
    'United States. The world\'s largest economy, with the deepest and most liquid real estate market globally.',
    'American interior. Vast land, cheap by coastal standards, anchored by agricultural and industrial output.',
    'US sunbelt. The fastest-growing population corridor in America: no state income tax, cheap land, rising demand.',
    'US mountain west. Remote, resource-rich, and increasingly sought after as remote work untethers people from coastal cities.',
    'Great Plains. The world\'s grain basket: wheat and corn on some of the most productive arable land on the planet.',
    'Appalachia. Coal country pivoting to tech and tourism. Property cheap enough that remote workers changed the local market overnight.',
    'Pacific Northwest. Evergreen forests, volcanic peaks, and a tech economy that pushed Seattle housing past San Francisco parity.',
    'Rust Belt. Detroit to Pittsburgh: post-industrial cities where property is cheap and urban revival is uneven but real.',
    'New England. Colonial towns, Ivy League universities, and a tourism economy built on autumn foliage and maritime history.',
    'Deep South. Alabama to Mississippi: low cost of living, intense heat, and a land market shaped by agricultural history and persistent poverty gaps.',
  ],
  'Canada': [
    'Canada. The world\'s second-largest country by area. Vast resource wealth, stable institutions, and two overpriced coastal cities.',
    'Canadian Shield. Granite, boreal forest, freshwater, and minerals. Sparsely populated and unlikely to change.',
    'Prairie provinces. Alberta oil, Saskatchewan wheat, and Manitoba cattle: the resource base of a trillion-dollar economy.',
    'British Columbia interior. Mountains, mining, and rivers draining into the Pacific. Timber wealth and ski resorts.',
    'Quebec. French Canada: distinct culture, strong institutions, and property markets that diverged from Ontario a decade ago.',
    'Ontario hinterland. Beyond the Toronto bubble: farmland, small cities, and a manufacturing base that followed the auto industry.',
    'Atlantic Canada. Nova Scotia, New Brunswick, PEI — fishing, forestry, and some of the cheapest coastal property in North America.',
    'Canadian Arctic. Permafrost, mineral rights, and the world\'s longest undefended coastline opening up as ice retreats.',
  ],
  'Japan': [
    'Japan. The world\'s third-largest economy. Precision manufacturing, cultural exports, and the yen as a safe-haven currency.',
    'Japanese countryside. Aging rural villages where properties sell for ¥1 — next to Shinkansen-connected cities worth millions.',
    'Hokkaido. Japan\'s northern island: dairy farming, skiing, and land prices so low that foreign buyers have been snapping up farms.',
    'Kyushu. The southernmost major island: automotive manufacturing, hot springs, and Korea just 200km across the strait.',
    'Chugoku. San\'in coast meets Seto Inland Sea: the quietest corner of Honshu, depopulating at Japan\'s fastest rate.',
    'Tohoku. Northeast Honshu: rice paddies, sake breweries, and a reconstruction economy still rebuilding a decade after 2011.',
    'Chubu. Alpine heartland: Toyota City, Mount Fuji\'s flanks, and the Noto Peninsula that traditional crafts kept alive.',
  ],
  'South Korea': [
    'South Korea. Semiconductors, K-pop, shipbuilding. The world\'s most wired country with the most competitive education system.',
    'Korean peninsula. Samsung, Hyundai, LG — three companies whose value rivals the GDP of a mid-sized European nation.',
    'Korean countryside. Small cities sustained by manufacturing clusters, rice paddies, and ginseng farms.',
    'Gyeonggi province. Seoul\'s commuter belt: 13 million people in cities that grew faster than any planning system could absorb.',
    'Jeju Island. Volcanic island, UNESCO biosphere, and South Korea\'s domestic tourism capital.',
    'Busan hinterland. Korea\'s second city spread into fishing villages and container port logistics chains along the south coast.',
  ],
  'China': [
    'China. The world\'s second-largest economy. 1.4 billion consumers, state-directed infrastructure, and land owned by the state.',
    'Chinese interior. Manufacturing relocation inland from coastal megacities — inland tiers catching up on decades of investment.',
    'Yangtze Delta. The richest river basin in Asia: Shanghai, Suzhou, Hangzhou — where China\'s middle class was invented.',
    'Pearl River Delta. Shenzhen–Guangzhou–Hong Kong: the factory floor that made cheap electronics a global norm.',
    'Sichuan basin. Chengdu and Chongqing: 100 million people in an inland province growing faster than the coast.',
    'Manchuria. Rustbelt northeast: Soviet-era heavy industry, soybean plains, and a demographic collapse no policy has reversed.',
    'Xinjiang. Desert frontier: cotton, minerals, surveillance infrastructure, and the most geopolitically sensitive land in China.',
    'Yunnan. Tropical mountains bordering Myanmar, Laos, and Vietnam. Tourism from Lijiang to Dali draws 50 million visitors a year.',
    'Hainan. China\'s Hawaii: tropical island free-trade zone, duty-free shopping, and a real estate market restricted to Chinese citizens.',
  ],
  'India': [
    'India. 1.4 billion people, the fastest-growing major economy, and an urbanisation wave still in its early innings.',
    'Indian subcontinent. Tropical climate, river plains, and a real estate market driven by one of the world\'s largest diasporas.',
    'Gangetic plain. The Ganges basin: 500 million people on alluvial soil that feeds the subcontinent.',
    'Deccan plateau. India\'s manufacturing interior: Pune, Hyderabad, Bengaluru — the cities building India\'s tech economy.',
    'Rajasthan. Desert kingdom turned tourist magnet: palaces, forts, and camel country where solar farms now outnumber camels.',
    'Kerala backwaters. Tropical coast, high literacy, and a remittance economy funded by 3 million Keralites working in the Gulf.',
    'Northeast India. Seven sister states: hills, tea estates, and rivers draining into Bangladesh at the edge of the subcontinent.',
    'Gujarat. India\'s most business-friendly state: ports, petrochemicals, diamonds, and the Tata and Ambani family origins.',
  ],
  'Australia': [
    'Australia. Vast continent, small population, enormous mineral wealth, and some of the world\'s most expensive urban property.',
    'Australian outback. Iron ore, coal, and cattle on land so remote the nearest neighbour might be 200km away.',
    'Queensland hinterland. Sugarcane, beef cattle, and coal seams beneath a landscape that receives 7 months of tropical sun.',
    'Western Australian interior. The Pilbara iron ore plateau: more minerals per square kilometre than anywhere outside Congo.',
    'Murray-Darling basin. The food bowl: cotton, almonds, wine grapes, and a water rights dispute that has run for 40 years.',
    'Tasmania. Island state: wilderness, salmon, whisky, and property prices driven up by mainlanders buying remoteness.',
    'Northern Territory. The red centre: Uluru, cattle stations the size of Belgium, and a land rights framework that rewrote Australian law.',
  ],
  'Brazil': [
    'Brazil. South America\'s largest economy. 215 million people, extraordinary biodiversity, and a commodity export machine.',
    'Cerrado. The Brazilian savanna being converted to soy farms faster than any land use change on Earth.',
    'Amazon rainforest. The world\'s largest carbon sink. Deforestation pressure from cattle ranching and soy is accelerating.',
    'Brazilian northeast. Fortaleza, Recife, Salvador — semi-arid hinterland with tourism coast and a poverty rate double the south.',
    'São Paulo state interior. Sugarcane, oranges, and the world\'s largest flex-fuel vehicle fleet on Brazil\'s richest agricultural land.',
    'Rio de Janeiro hinterland. Beyond Carnival: oil fields, steel mills, and favela expansion into hillsides that no planning code covers.',
    'Rio Grande do Sul. Brazil\'s gaucho south: European immigrant towns, wine, soy, and a climate unlike anything else in the tropics.',
  ],
  'Russia': [
    'Russia. The world\'s largest country by land area. Hydrocarbons, minerals, and timber under sanctions-era conditions.',
    'Siberia. Permafrost over oil fields larger than most countries. Strategic value inversely proportional to accessibility.',
    'Russian Far East. Vladivostok to Sakhalin: Pacific-facing resource extraction with a shrinking population being courted back with tax incentives.',
    'Krasnodar Krai. The Russian Riviera: Black Sea coast, wheat fields, and the only subtropical climate in the Russian Federation.',
    'Urals. The boundary of Europe and Asia: metals, mining, and cities that were closed to foreigners until 1991.',
    'Volga region. Russia\'s agricultural heartland: wheat, sunflowers, and river trade on the longest river in Europe.',
  ],
  'Turkey': [
    'Turkey. A country straddling two continents. 85 million people, NATO membership, and an economy swinging between boom and inflation crisis.',
    'Anatolian plateau. Wheat, livestock, and salt lakes on a high plain surrounded by mountain ranges on three sides.',
    'Turkish Aegean coast. Bodrum, Izmir, Cesme — turquoise coves, olive groves, and a coastal property market priced for Europeans.',
    'Black Sea coast. Hazelnut orchards, tea fields, and fishing ports in Turkey\'s rainiest and greenest corner.',
    'Southeast Anatolia. GAP project irrigation, Kurdish majority cities, and land contested since the Bronze Age.',
  ],
  'Mexico': [
    'Mexico. The world\'s 15th-largest economy. Nearshoring boom, USMCA trade flows, and a real estate market mispriced for risk.',
    'Baja California. Desert peninsula: Tijuana manufacturing, Los Cabos tourism, and a real estate market dollarised by American retirees.',
    'Yucatan Peninsula. Mayan ruins, cenotes, and a tourism economy pivoting from Cancun to Tulum at alarming speed.',
    'Guadalajara metro. Mexico\'s Silicon Valley: software, tequila distilleries, and a middle class that grew 40% in a decade.',
    'Oaxaca. Mountain state with sixteen indigenous groups, mezcal production, and a creative economy drawing Mexico City expats.',
    'Veracruz coast. Oil ports, tropical agriculture, and the oldest continuously inhabited city in the Americas.',
  ],
  'Indonesia': [
    'Indonesia. 270 million people across 17,000 islands. The world\'s largest Muslim-majority nation and fourth-largest country by population.',
    'Java interior. Volcanoes, rice terraces, and 150 million people on an island smaller than California.',
    'Kalimantan. Indonesian Borneo: palm oil, coal, nickel, and the new capital Nusantara rising from the rainforest.',
    'Sulawesi. Nickel and cobalt beneath mountain terrain: critical battery minerals driving a new extractive economy.',
    'Papua. The most biodiverse island on Earth, with mineral wealth — copper, gold — that is both its fortune and its curse.',
    'Sumatra. Palm oil, rubber, coffee, and Aceh — Indonesia\'s westernmost province rebuilt after the 2004 tsunami.',
  ],
  'Nigeria': [
    'Nigeria. Africa\'s largest economy. 220 million people, oil wealth, a Nollywood film industry, and a fintech ecosystem growing faster than anywhere.',
    'Niger Delta. The oil rivers: pipeline networks, mangrove swamps, and a resource curse that has made the region wealthy in extraction and poor in development.',
    'Lagos hinterland. Africa\'s largest city sprawling into Ogun State: real estate prices that shocked investors into taking Africa seriously.',
    'Abuja surrounds. Planned capital growing outward: government land allocations and diplomatic compound construction.',
    'North Nigeria. The Hausa–Fulani heartland: Sahel pasture, groundnuts, and Kano\'s ancient leather and textile trade.',
  ],
  'South Africa': [
    'South Africa. Africa\'s most industrialised economy. Gold, platinum, wine, and a real estate market priced for rand volatility.',
    'Karoo. Semi-desert plateau: sheep farming, shale gas potential, and 360-degree skies that draw astronomers.',
    'Garden Route. Coastal forest and fynbos between Mossel Bay and Storms River — a tourist corridor with the highest property premiums outside the metros.',
    'Limpopo. The bushveld: game reserves, citrus farms, platinum mines, and the Zimbabwe border.',
    'Free State. Wheat and sunflower country on the High Veld: the least glamorous and most productive agricultural province.',
  ],
  'Argentina': [
    'Argentina. South America\'s second-largest economy. Beef, soy, lithium, and a peso that has been in structural crisis for 80 years.',
    'Pampas. The world\'s most fertile temperate grassland: 60 million cattle and soy exports that fed half of Asia\'s growth.',
    'Patagonia. Wind-scoured steppe and Andean glaciers. Tourism, sheep, oil, and land bought by foreigners at prices locals resent.',
    'Mendoza wine country. Malbec on alluvial fans at 700m altitude: a wine economy backed by Chilean Andes snowmelt irrigation.',
    'Corrientes. Subtropical wetlands: the Iberá marshes, cattle ranching, and river tourism on the Upper Paraná.',
  ],
  'Egypt': [
    'Egypt. The Arab world\'s most populous country. 105 million people, the Suez Canal, and a real estate market tied to Gulf remittances.',
    'Nile Delta. The most densely populated agricultural land in Africa: rice, cotton, and vegetables on silt deposited for 5,000 years.',
    'Sinai Peninsula. Desert, coral reefs, and a tourism economy anchored by Sharm el-Sheikh and Dahab.',
    'Nile Valley. 1,000km of irrigated strip agriculture: the narrow green thread that explains why Egypt\'s civilisation never moved.',
    'Western Desert. The Sahara west of the Nile: oasis towns, oil exploration, and solar potential that dwarfs Europe\'s installed capacity.',
  ],
  'Saudi Arabia': [
    'Saudi Arabia. The world\'s largest oil exporter and the custodian of Mecca and Medina. Vision 2030 is betting on tourism replacing petroleum revenue.',
    'Hejaz. The Red Sea coast: Jeddah, Mecca, Medina — the commercial and religious heartland of the Arab world.',
    'Rub al-Khali. The Empty Quarter: the world\'s largest continuous sand desert, mostly oil-bearing, mostly uninhabited.',
    'Asir mountains. Southwestern highlands: terraced farms, juniper forests, and summer temperatures 20°C below Riyadh.',
    'Al-Ahsa oasis. The world\'s largest oasis: date palms, artesian springs, and the historical agricultural heartland of the Eastern Province.',
  ],
  'Poland': [
    'Poland. Central Europe\'s largest economy. EU funds, skilled labour, and a manufacturing base that caught a wave of German outsourcing.',
    'Masovian plain. Warsaw\'s hinterland: grain fields and river valleys in the flattest country in Europe.',
    'Lesser Poland. Kraków\'s region: medieval heritage, salt mines, and a tech cluster built around Jagiellonian University graduates.',
    'Silesia. The old coal country pivoting to logistics hubs and BMW and Mercedes component factories.',
    'Warmia-Mazuria. The land of a thousand lakes: glacial landscape, rural depopulation, and growing eco-tourism.',
  ],
  'Netherlands': [
    'Netherlands. The world\'s second-largest agricultural exporter after the US. Reclaimed land, tulips, and a port that handles 15% of all EU imports.',
    'Polder landscape. Land below sea level held back by dikes: some of the most intensively managed agricultural real estate on Earth.',
    'Randstad hinterland. The ring of cities — Amsterdam, Rotterdam, Utrecht, The Hague — spreading into greenhouse belts and commuter villages.',
    'Groningen. Gas fields that funded Dutch welfare for decades — and caused earthquakes that have now shut the taps.',
  ],
  'Switzerland': [
    'Switzerland. The world\'s highest GDP per capita (PPP). Banking secrecy fading but watch exports, pharma, and chocolate still gold-plated.',
    'Swiss Plateau. The Mittelland: where 70% of Switzerland\'s 8.7 million people live, between Jura and Alps.',
    'Valais. High Alpine valleys: vineyards at 600m, glaciers at 4,000m, and ski resorts where Russians and Gulf royalty buy chalets.',
    'Ticino. Italian-speaking Switzerland: Mediterranean climate north of the Alps, and the cheapest Swiss property you can find.',
  ],
  'Sweden': [
    'Sweden. The Nordic model: egalitarian welfare state, IKEA, Spotify, and a forest economy that still accounts for 10% of exports.',
    'Norrland. The empty north: boreal forest, iron ore, hydropower, and a population density of 5 people per sq km.',
    'Dalarna. The folkloric heart of Sweden: midsummer poles, Dala horses, and summer cottages beside mirror-flat lakes.',
    'Skåne. The breadbasket: Denmark-adjacent, flat, and producing half of Sweden\'s grain on some of its most valuable farmland.',
  ],
  'Norway': [
    'Norway. The world\'s largest sovereign wealth fund and the second-largest fish exporter. Oil runs out; salmon apparently doesn\'t.',
    'Norwegian fjords. Glacially carved inlets: a coastline longer than the equator, most of it uninhabited and most of it spectacular.',
    'Finnmark. The Arctic north: reindeer herding, Northern Lights tourism, and a border with Russia that NATO has never taken lightly.',
    'Telemark. Mountain plateau: the birthplace of skiing, and hydro power that makes Norway\'s aluminium smelters run on green electricity.',
  ],
  'Ukraine': [
    'Ukraine. Europe\'s largest country by area within its borders. Black earth chernozem covering 30% of global topsoil reserves.',
    'Donbas. Industrial heartland and active war zone: coal, steel, and a conflict that has reshaped European security.',
    'Lviv region. Western Ukraine: Hapsburg architecture, EU-facing economy, and the fastest-growing property market in the country\'s prewar west.',
    'Odessa oblast. Black Sea coast: grain export terminals, beach tourism, and a port city that has changed empires six times.',
  ],
  'Pakistan': [
    'Pakistan. 230 million people, a nuclear state, and an economy perpetually at the IMF. Cotton, textiles, and the China-Pakistan Economic Corridor.',
    'Indus plain. The Punjab and Sindh: irrigated wheat and cotton on the Indus River system feeding 150 million people.',
    'Khyber Pakhtunkhwa. The tribal frontier: passes to Afghanistan, marble quarries, and gemstone mines in the Hindu Kush foothills.',
    'Balochistan. The largest province by area, the smallest by population: copper, gold, gas, and a separatist insurgency.',
  ],
  'Bangladesh': [
    'Bangladesh. 170 million people on a Bengal Delta the size of Greece. The world\'s second-largest garment exporter.',
    'Chittagong hills. The only non-flat terrain in Bangladesh: tea estates, tribal communities, and ship-breaking yards on the coast.',
    'Sylhet. Tea garden country: lush hills and the origin point of Britain\'s Bangladeshi diaspora.',
  ],
  'Iran': [
    'Iran. 88 million people, the world\'s fourth-largest oil reserves, and a sanctions-isolated economy of extraordinary resilience.',
    'Iranian plateau. Arid interior ringed by mountains: pistachio and saffron farms in valleys watered by ancient qanats.',
    'Caspian coast. The Alborz mountains meet a humid subtropical shore: tea, rice, and the only truly green landscape in Iran.',
    'Persian Gulf coast. Khuzestan oil fields and the Strait of Hormuz — the geography that makes Iran a global energy chokepoint.',
  ],
  'Thailand': [
    'Thailand. 70 million people, the world\'s largest rice exporter, and a tourist economy pre-COVID worth 20% of GDP.',
    'Chao Phraya basin. The Central Plains: rice paddies and shrimp farms feeding a country that exports 10 million tonnes of rice a year.',
    'Northern highlands. Chiang Rai and Chiang Mai: hill tribe villages, coffee, and a cooler climate that draws retirees from Bangkok.',
    'Southern peninsula. Rubber and palm oil above ground, tin below — with beach tourism on both Andaman Sea and Gulf coasts.',
  ],
  'Vietnam': [
    'Vietnam. 98 million people, 30 years of Doi Moi reform, and a manufacturing economy absorbing work fleeing China\'s wage inflation.',
    'Mekong Delta. The rice bowl: nine-armed river delta producing 50% of Vietnam\'s rice and 90% of its fruit exports.',
    'Red River Delta. Hanoi\'s plain: densely cultivated, densely populated, and the cradle of Vietnamese civilisation.',
    'Central Highlands. Buon Ma Thuot: the coffee capital of a country that is the world\'s second-largest coffee exporter.',
    'Da Nang coast. 30km of beach between mountains and sea: the fastest-growing tourist destination in Southeast Asia.',
  ],
  'Philippines': [
    'Philippines. 115 million people across 7,600 islands. BPO capital of the world and the Pacific\'s largest archipelago economy.',
    'Visayas. The central islands: rice and sugar on Negros, tourism on Cebu and Bohol, fishing across 2,000 islands.',
    'Mindanao. The southern island: pineapple, tuna, gold, and a Muslim-majority region with a 50-year insurgency history.',
    'Luzon hinterland. Beyond Metro Manila: rice terraces in Ifugao, tobacco in Cagayan, and volcanoes including active Pinatubo.',
  ],
  'Malaysia': [
    'Malaysia. 33 million people, palm oil, rubber, and a semiconductor supply chain that makes the world\'s laptops run.',
    'Sabah and Sarawak. Malaysian Borneo: rainforest, orang-utans, liquefied natural gas, and timber — sometimes all four on the same concession.',
    'Pahang interior. The peninsular jungle: Cameron Highlands tea, Taman Negara rainforest, and gold mines under forest reserve.',
  ],
  'Kenya': [
    'Kenya. East Africa\'s largest economy. Nairobi tech hub, Mombasa port, and a tourism economy anchored by the Masai Mara.',
    'Rift Valley. Kenya\'s agricultural spine: tea, coffee, wheat, and flower farms exporting to Schiphol overnight.',
    'Coastal strip. Mombasa to Malindi: Swahili architecture, coral reef tourism, and port logistics for a landlocked hinterland.',
    'Northern Kenya. Arid, pastoral, and resource-rich: oil in Turkana, wind power in Lake Turkana, and drought every three years.',
  ],
  'Ethiopia': [
    'Ethiopia. 120 million people and the African Union headquarters. Coffee origin, highland agriculture, and a dam that upstream neighbours fear.',
    'Ethiopian highlands. The Roof of Africa: fertile plateaus at 2,000–3,000m, teff fields, and a climate that allowed civilisation without the coast.',
    'Afar triangle. Below sea level, above 50°C, and sitting on one of the world\'s most active volcanic rift zones.',
    'Somali Region. The Ogaden: pastoral lowland, camel herding, and oil exploration in contested territory.',
  ],
  'Morocco': [
    'Morocco. The Arab world\'s most stable monarchy and the world\'s largest phosphate exporter. One hour from Europe by ferry.',
    'Atlantic plains. Casablanca\'s hinterland: irrigated wheat, market gardening, and a growing aerospace manufacturing cluster.',
    'High Atlas. The Berber heartland: saffron valleys, walnut groves, and mule tracks that have been trade routes for 2,000 years.',
    'Saharan fringe. Ouarzazate and the Draa Valley: date palms, kasbahs, and a film industry renting the desert to Hollywood.',
  ],
  'Ghana': [
    'Ghana. West Africa\'s most stable democracy. Gold, cocoa, and oil — the three commodities that have taken turns growing the economy.',
    'Ashanti Region. Kumasi and the cocoa belt: Ghana\'s second city surrounded by the world\'s richest cacao-growing soil.',
    'Volta Region. The lake behind Akosombo Dam: hydropower, tilapia fishing, and one of Africa\'s largest man-made reservoirs.',
    'Northern Ghana. The Sahel fringe: cattle, shea butter, and a development gap with the south that migration has not closed.',
  ],
  'Peru': [
    'Peru. The world\'s second-largest copper producer and the birthplace of the potato. Andean highlands, Amazon jungle, coastal desert.',
    'Peruvian Amazon. Loreto and Ucayali: 60% of Peru\'s land area, 5% of its population, and 10% of Amazonian biodiversity.',
    'Andean highlands. Cusco to Puno: Inca stonework above 3,400m in a landscape where quinoa and potatoes evolved together.',
    'Coastal desert. Lima\'s backdrop: one of the driest places on Earth, irrigated by Andean snowmelt to grow asparagus for European supermarkets.',
  ],
  'Colombia': [
    'Colombia. South America\'s fourth-largest economy. Coffee, flowers, coal, and a peace dividend finally unlocking tourism and FDI.',
    'Colombian coffee region. Eje Cafetero: steep volcanic hillsides at 1,500m altitude producing Arabica beans UNESCO-listed as cultural heritage.',
    'Llanos. The eastern plains: cattle ranching and oil extraction on a flat savanna the size of France.',
    'Pacific coast. The Chocó: the world\'s highest rainfall, the world\'s most biodiverse rainforest, and near-zero infrastructure.',
  ],
  'Chile': [
    'Chile. The world\'s longest country. Atacama copper, Patagonia ice, and a Pacific coast anchored by the most stable institutions in Latin America.',
    'Atacama Desert. The driest non-polar place on Earth: copper mines, lithium brines, and the world\'s clearest skies for astronomy.',
    'Central Valley. Wine country: Maipo, Colchagua, Casablanca — irrigation channels from Andes melt producing Cabernet at scale.',
    'Chiloé. Archipelago of wooden churches, salmon farms, and myths: southern Chile where the Pacific swallows the continent.',
  ],
  'New Zealand': [
    'New Zealand. Two islands, 5 million people, and the most remote significant economy on Earth. Dairy, wine, geothermal energy, and tourism.',
    'Canterbury plains. New Zealand\'s breadbasket: dairy and wheat on flat alluvial land drained by Rakaia and Waimakariri rivers.',
    'Northland. The subtropical tip of the North Island: kauri forests, pohutukawa coasts, and the Bay of Islands where the Treaty of Waitangi was signed.',
    'Marlborough Sounds. Drowned river valleys making the world\'s most complex coastline at the top of the South Island. Sauvignon Blanc country.',
  ],
  'Greece': [
    'Greece. 11 million people, 16,000km of coastline, and a debt crisis that remade European fiscal politics for a decade.',
    'Greek islands. Mykonos to Rhodes: tourism-dependent archipelago where property prices reflect Athenian flight capital and Northern European second homes.',
    'Thessaly. The Greek breadbasket: cotton, wheat, and tomatoes on the Larissa plain in the most fertile region of a mountainous country.',
    'Macedonia region. Thessaloniki\'s hinterland: peach orchards, wine, and a city that was once the second capital of the Byzantine Empire.',
  ],
  'Portugal': [
    'Portugal. 10 million people on the Atlantic edge of Europe. Wine, cork, tourism, and a Golden Visa scheme that reshaped Lisbon\'s property market.',
    'Alentejo. The cork and olive heartland: rolling hills at 1–2 trees per hectare, latifundia farms, and some of the EU\'s cheapest farmland.',
    'Algarve. 300 days of sun and a golf resort economy that turned fishing villages into Northern Europe\'s retirement destination.',
    'Douro Valley. Port wine terraces on schist cliffs above the Douro River: UNESCO-listed vineyard landscape with the steepest mechanised viticulture in the world.',
    'Minho. Green, rainy northwest: Vinho Verde vines, granite farms, and a border with Spain that existed before the nation.',
  ],
  'Austria': [
    'Austria. 9 million people in the Alps. Vienna\'s imperial legacy, Tyrolean ski resorts, and an economy more reliant on tourism than any other G20 neighbour.',
    'Tyrol. Innsbruck and the Inn Valley: ski resorts, hydropower, and Austrian manufacturing at altitude.',
    'Styria. The green heart: pumpkin seed oil, Lipizzaner horses, and a Graz tech cluster growing in the shadow of Vienna.',
    'Burgenland. Hungary-adjacent lowland: Pannonian climate, Blaufränkisch wine, and EU\'s largest wind farm cluster.',
  ],
  'Belgium': [
    'Belgium. 11 million people at the heart of the EU. Chocolate, beer, diamonds, and the bureaucratic capital of a continent.',
    'Wallonia. French-speaking south: former coal and steel belt now trailing Flanders in almost every economic metric.',
    'Flanders. Dutch-speaking north: Antwerp\'s port, BASF\'s European HQ, and agricultural land twice as productive as Wallonia\'s.',
    'Ardennes. The Belgian highlands: hiking, castles, and Trappist breweries in a landscape that briefly stopped a world war.',
  ],
  'Czech Republic': [
    'Czech Republic. Central Europe\'s most industrialised economy per capita. Beer, Skoda, and a manufacturing base tied to German supply chains.',
    'Bohemian basin. Hops, carp ponds, and Baroque towns in a landlocked country that brews 160 litres of beer per person per year.',
    'Moravia. The wine-growing east: Riesling and Welschriesling on limestone slopes above the Dyje river.',
    'Bohemian Forest. Šumava borderland: EU\'s second-largest national park and Cold War no-man\'s-land still recovering from 50 years of exclusion.',
  ],
  'Hungary': [
    'Hungary. Landlocked Central European middle power. Thermal baths, Tokaj wine, and a government that pioneered illiberal democracy inside the EU.',
    'Great Hungarian Plain. The Puszta: flat, wind-swept steppe turned wheat field. Magyar cowboys and paprika peppers.',
    'Lake Balaton. Central Europe\'s largest lake: summer resort for 200km of Hungarian and Austrian families since the Habsburg era.',
    'Northern Highlands. Wine country: Eger, Tokaj, Esztergom — where Hungary\'s finest Furmint grapes grow on volcanic tuff.',
  ],
  'Romania': [
    'Romania. 19 million people, the EU\'s second-largest country by area in Eastern Europe. Wheat, oil, IT outsourcing, and a brain drain that removed 4 million people.',
    'Transylvania. The plateau: Dracula\'s castle country — actually Saxon towns, medieval walls, and Carpathian bear territory.',
    'Walachia. Bucharest\'s plain: sunflower oil, wheat, and a capital city growing at a pace its infrastructure cannot match.',
    'Danube Delta. 5,800 sq km of wetland: the most biodiverse delta in Europe, a UNESCO biosphere, and a pelican population of 15,000.',
  ],
}

// ── Region-level bbox fallbacks (multi-country regions) ──────────────────────
const REGION_NARRATIVES = [
  { lngMin: 4, lngMax: 32, latMin: 55, latMax: 72, lines: [
    'Scandinavia. The world\'s highest GDP per capita cluster. Oil wealth (Norway), design exports (Denmark), and green tech (Sweden).',
    'Nordic landscape. Fjords, forests, and farmland in the world\'s most equal societies.',
    'Baltic shore. Glaciated coast between Scandinavia and the North European Plain: amber, fishing, and EU membership since 2004.',
  ]},
  { lngMin: 14, lngMax: 34, latMin: 44, latMax: 56, lines: [
    'Central Europe. Poland, Czech Republic, Hungary: EU-funded infrastructure, skilled labour, and property rising to Western levels.',
    'Eastern EU frontier. Where German manufacturing relocated for cost. Now the workers are pricing that into local real estate.',
  ]},
  { lngMin: 50, lngMax: 90, latMin: 36, latMax: 56, lines: [
    'Central Asia. The stans: oil, gas, uranium, and cotton on one of the world\'s most strategically positioned land corridors.',
    'Silk Road corridor. Ancient trade route now the subject of Chinese Belt and Road investment and Russian sphere of influence.',
    'Kazakh steppe. The world\'s largest landlocked country: wheat, oil, uranium, and space launches from Baikonur.',
  ]},
  { lngMin: -92, lngMax: -60, latMin: 8, latMax: 26, lines: [
    'Central America and Caribbean. Tropical climate, dollar-adjacent economies, and a real estate market powered by US retirees and crypto.',
    'Caribbean basin. Island chain real estate with tourism demand, offshore finance, and the most literal definition of limited supply.',
    'Central American isthmus. Panama Canal tolls, banana plantations, and a migration corridor that moves more people than any border wall can stop.',
  ]},
  { lngMin: -20, lngMax: 52, latMin: -35, latMax: 16, lines: [
    'Sub-Saharan Africa. The world\'s highest birth rate and the world\'s largest urban construction boom. Early stage.',
    'African savanna. Vast grassland, wildlife corridors, and mineral wealth being unlocked by new infrastructure.',
    'West Africa. The Gulf of Guinea oil arc: Nigeria, Ghana, Côte d\'Ivoire — a trillion dollars of hydrocarbon above and below ground.',
    'East African Rift. The geological seam splitting Africa: volcanoes, great lakes, and some of the world\'s earliest human fossil sites.',
  ]},
  { lngMin: -6, lngMax: 37, latMin: 20, latMax: 38, lines: [
    'North Africa. Mediterranean climate on the Sahara\'s edge. Tourism, phosphates, and a young population driving urban growth.',
    'Sahara. The world\'s largest hot desert: 9 million sq km of sand, rock, and solar potential that dwarfs Europe\'s energy consumption.',
    'Maghreb. Morocco, Algeria, Tunisia — Berber and Arab history, Atlas mountains, and a French colonial urban grid still intact.',
  ]},
  { lngMin: 25, lngMax: 60, latMin: 15, latMax: 38, lines: [
    'Middle East. The world\'s energy crossroads: oil, gas, and the waterways — Suez, Hormuz, Bab-el-Mandeb — that ship it.',
    'Fertile Crescent. The birthplace of agriculture, writing, and cities. Now Iraq, Syria, and Lebanon — in various states of reconstruction.',
    'Levant coast. Israel, Lebanon, western Syria: Mediterranean climate, dense history, and the most fought-over real estate per square kilometre on Earth.',
  ]},
  { lngMin: 95, lngMax: 141, latMin: -10, latMax: 28, lines: [
    'Southeast Asia. 700 million people across a maritime region integrating into one of the world\'s fastest-growing economic blocs.',
    'ASEAN territory. Manufacturing shifting here from China, tourism recovering, and a middle class growing by 70 million per decade.',
    'Mekong region. Five countries sharing one river: dams upriver, fisheries downriver, and a power struggle between China and the West for influence.',
  ]},
  { lngMin: 27, lngMax: 180, latMin: 48, latMax: 75, lines: [
    'Russia and Siberia. The world\'s largest country by land area. Hydrocarbons, minerals, and timber under sanctions-era conditions.',
    'Siberian interior. Permafrost over oil fields larger than most countries. Strategic value inversely proportional to accessibility.',
    'Russian Far East. Pacific-facing taiga: tigers, salmon, gold, and a border with China that geographers call the world\'s most asymmetric.',
  ]},
  { lngMin: -82, lngMax: -35, latMin: -56, latMax: 13, lines: [
    'South America. 430 million people on a continent with extraordinary resource wealth and persistent institutional volatility.',
    'Amazon basin. The world\'s largest rainforest. Carbon credit value rising faster than its timber, for now.',
    'Andean corridor. High-altitude agricultural land, copper mines, and cities growing faster than their infrastructure can handle.',
    'Southern Cone. Argentina, Chile, Uruguay — temperate, literate, and economically volatile in ways that have repeatedly surprised optimists.',
  ]},
  { lngMin: -180, lngMax: 180, latMin: -90, latMax: 90, lines: [
    'Open ocean or polar expanse. No comparable sales. No population. First mover territory.',
    'Remote unclaimed zone. Beyond current infrastructure — but that\'s been said before about every frontier.',
    'Uninhabited coordinates. The question isn\'t what it\'s worth now. It\'s what it\'s worth when the world runs out of land.',
  ]},
]

function getTerritoryNarrative(tx, ty, _country) {
  const { lng, lat } = tileNW(tx, ty, PURCHASE_ZOOM)
  const hash = (tx * 2971 + ty * 1619) >>> 0

  const inBox = r => lng >= r.lngMin && lng < r.lngMax && lat >= r.latMin && lat < r.latMax
  const pick = r => r.lines[hash % r.lines.length]

  // 1. City / sub-national tight bboxes
  for (const r of NARRATIVES) {
    if (inBox(r)) return pick(r)
  }

  // 2. Country-level bbox lookup — works for any tile regardless of ownership
  for (const r of COUNTRY_BBOX_NARRATIVES) {
    if (inBox(r)) return pick(r)
  }

  // 3. Continental / regional broad fallback
  for (const r of REGION_NARRATIVES) {
    if (inBox(r)) return pick(r)
  }

  return 'Remote coordinates. No recorded sales. First mover territory — the map still has blank spaces.'
}

function regionStats(blocks, tx, ty) {
  const nwCorner = tileNW(tx, ty, PURCHASE_ZOOM)
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const { x: rx0, y: ry0 } = lngLatToTile(nwCorner.lng - 5, clamp(nwCorner.lat + 5, -84, 84), PURCHASE_ZOOM)
  const { x: rx1, y: ry1 } = lngLatToTile(nwCorner.lng + 5, clamp(nwCorner.lat - 5, -84, 84), PURCHASE_ZOOM)
  let regionOwned = 0
  const regionSize = Math.max(1, (Math.abs(rx1 - rx0) + 1) * (Math.abs(ry1 - ry0) + 1))
  for (const b of blocks.values()) {
    if (b.tx >= rx0 && b.tx <= rx1 && b.ty >= ry0 && b.ty <= ry1) regionOwned++
  }
  return { regionOwned, regionSize, regionFree: Math.max(0, regionSize - regionOwned) }
}

function timeAgo(ms) {
  const d = (Date.now() - ms) / 1000
  if (d < 60)    return `${Math.floor(d)}s ago`
  if (d < 3600)  return `${Math.floor(d/60)}m ago`
  if (d < 86400) return `${Math.floor(d/3600)}h ago`
  return `${Math.floor(d/86400)}d ago`
}

export default function PurchasePanel() {
  const selectedKey        = useGameStore(s => s.selectedKey)
  const blocks             = useGameStore(s => s.blocks)
  const clearSelected      = useGameStore(s => s.clearSelected)
  const openPurchaseModal  = useGameStore(s => s.openPurchaseModal)
  const openCustomizeModal = useGameStore(s => s.openCustomizeModal)
  const myBlocks           = useGameStore(s => s.myBlocks)
  const soldCount          = useGameStore(s => s.stats).sold || blocks.size
  const isMobile           = useIsMobile()

  const guardians         = useGuardianStore(s => s.guardians)
  const openGuardianModal = useGuardianStore(s => s.openGuardianModal)
  const openRaidModal     = useGuardianStore(s => s.openRaidModal)

  const [copied, setCopied]           = useState(false)
  const [showCert, setShowCert]       = useState(false)
  const [viewerCount, setViewerCount] = useState(0)
  const [displayPrice, setDisplayPrice] = useState(null)
  const viewerRef = useRef(null)
  const priceRef  = useRef(null)

  const tx = selectedKey ? parseInt(selectedKey.split(':')[0], 10) : 0
  const ty = selectedKey ? parseInt(selectedKey.split(':')[1], 10) : 0
  const block      = selectedKey ? (blocks.get(selectedKey) ?? null) : null
  const isEmpty    = !block
  const isMine     = selectedKey ? myBlocks.has(selectedKey) : false
  const price      = block?.price ?? (selectedKey ? tileBasePrice(tx, ty) : '0')
  const scarcity   = (1 + soldCount / TOTAL_TILES * 3)
  const finalPrice = parseFloat((parseFloat(price) * scarcity).toFixed(2))
  const baseViewers = selectedKey ? fakeViewers(tx, ty) : 3

  useEffect(() => {
    if (!selectedKey) return
    setViewerCount(baseViewers)
    clearInterval(viewerRef.current)
    viewerRef.current = setInterval(() => {
      setViewerCount(v => {
        const drift = Math.random() < 0.3 ? (Math.random() < 0.5 ? 1 : -1) : 0
        return Math.max(1, Math.min(baseViewers + 8, v + drift))
      })
    }, 2800)
    return () => clearInterval(viewerRef.current)
  }, [selectedKey])

  useEffect(() => {
    if (!selectedKey || !isEmpty) { setDisplayPrice(null); return }
    setDisplayPrice(finalPrice)
    clearInterval(priceRef.current)
    priceRef.current = setInterval(() => {
      setDisplayPrice(p => parseFloat((p + 0.001).toFixed(3)))
    }, 4200)
    return () => clearInterval(priceRef.current)
  }, [selectedKey, isEmpty, finalPrice])

  if (!selectedKey) return null

  const guardian     = selectedKey ? guardians.get(selectedKey) : null
  const accentColor  = block?.color ?? 'var(--green)'
  const narrative    = getTerritoryNarrative(tx, ty, block?.country ?? 'Uncharted Territory')
  const { regionOwned, regionSize, regionFree } = isEmpty ? regionStats(blocks, tx, ty) : { regionOwned: 0, regionSize: 1, regionFree: 1 }
  const regionPct    = Math.round((regionOwned / regionSize) * 100)
  const priceDelta   = finalPrice - parseFloat((parseFloat(price) * (1 + Math.max(0, soldCount - 1) / TOTAL_TILES * 3)).toFixed(2))
  const pricePct     = parseFloat(price) > 0 ? ((priceDelta / parseFloat(price)) * 100).toFixed(4) : '0'
  const blocksToNext = Math.max(0, Math.ceil((Math.ceil(soldCount / TOTAL_TILES * 100) / 100) * TOTAL_TILES) - soldCount)
  const shownPrice   = displayPrice ?? finalPrice
  const shareUrl     = `${window.location.origin}${window.location.pathname}?block=${selectedKey}`

  const panelStyle = isMobile ? {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
    borderRadius: '20px 20px 0 0',
    paddingBottom: 'max(0px, var(--sab))',
    maxHeight: '88dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    animation: 'sheet-up 0.3s cubic-bezier(0.34,1.2,0.64,1)',
  } : {
    position: 'fixed', right: 14,
    bottom: 'calc(var(--feed-h) + 14px)', zIndex: 30,
    width: 320, borderRadius: 20,
    maxHeight: 'calc(100dvh - 110px)', overflowY: 'auto',
    animation: 'slide-in-right 0.24s cubic-bezier(0.34,1.2,0.64,1)',
  }

  return (
    <div className="panel" style={panelStyle}>
      {showCert && block && (
        <TileCertificate block={block} shareUrl={shareUrl} onClose={() => setShowCert(false)} />
      )}
      {isMobile && <div className="drag-handle" />}

      {/* Hero image */}
      {block?.imageUrl && (
        <div style={{ height: 130, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          <img
            src={block.imageUrl} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.65) saturate(0.7)' }}
            onError={e => { e.target.parentElement.style.display = 'none' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 20%, var(--s1) 100%)' }} />
          {block.label && (
            <div style={{ position: 'absolute', bottom: 14, left: 18, fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'var(--mono)' }}>
              {block.label}
            </div>
          )}
          <button onClick={clearSelected} style={{
            position: 'absolute', top: 12, right: 12,
            background: 'rgba(0,0,0,0.7)',
            border: 'none',
            color: 'rgba(255,255,255,0.7)', borderRadius: 8, width: 28, height: 28,
            cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{
        padding: isMobile ? '16px 18px 12px' : '18px 18px 12px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ marginBottom: 5 }}>
            {isEmpty ? (
              <span className="badge badge-green">Available</span>
            ) : isMine ? (
              <span className="badge badge-green">Your Block</span>
            ) : (
              <span className="badge" style={{ background: `${accentColor}18`, color: accentColor }}>Owned</span>
            )}
          </div>
          <h2 style={{
            fontSize: 19, fontWeight: 700, color: 'var(--t1)',
            letterSpacing: '-0.02em', lineHeight: 1.15,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {block?.country ?? 'Uncharted Territory'}
          </h2>
          <p style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)', marginTop: 3 }}>
            {tx}, {ty} · Z{PURCHASE_ZOOM}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
          {/* Viewers */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 9px', borderRadius: 20,
            background: 'var(--s3)',
            fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--t2)',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: 'var(--green)', flexShrink: 0,
              animation: 'pulse-dot 2.4s ease-in-out infinite',
            }} />
            {viewerCount}
          </div>
          {/* Share / certificate */}
          <button
            onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
            style={{ ...iconBtnStyle, color: copied ? 'var(--green)' : 'var(--t2)' }}
            title="Copy link"
          >{copied ? '✓' : '⎘'}</button>
          {block && (
            <button
              onClick={() => setShowCert(true)}
              style={{ ...iconBtnStyle, color: 'var(--t2)' }}
              title="View ownership certificate"
            >🪪</button>
          )}
          {!block?.imageUrl && (
            <button onClick={clearSelected} style={iconBtnStyle}>×</button>
          )}
        </div>
      </div>

      <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Narrative */}
        <p style={{
          fontSize: 12, color: 'var(--t2)', lineHeight: 1.65,
          fontStyle: 'italic', padding: '10px 13px',
          background: 'var(--s2)', borderRadius: 10,
        }}>
          {narrative}
        </p>

        {isEmpty ? (
          <>
            {/* Dynamic price with emotion-first layout */}
            <DynamicPricePanel
              selectedKey={selectedKey}
              country={block?.country ?? 'Uncharted Territory'}
              basePrice={parseFloat(price)}
              scarcity={scarcity}
              shownPrice={shownPrice}
              pricePct={pricePct}
              openPurchaseModal={openPurchaseModal}
              blocksToNext={blocksToNext}
              regionPct={regionPct}
              tx={tx}
              ty={ty}
            />

            <p style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center' }}>
              BTC · ETH · SOL · USDT · XRP and 5 more
            </p>
          </>
        ) : (
          <>
            <div style={{ background: 'var(--s2)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--b0)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: accentColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700, color: '#0f0f0f', fontFamily: 'var(--mono)',
                }}>
                  {((block.owner || '?')[0] || '?').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="label" style={{ display: 'block', marginBottom: 2 }}>Owner</span>
                  {/* Shortened chain-aware so a 65-char Radix / 58-char Cardano
                      address still shows its prefix AND its tail, instead of
                      being clipped to a meaningless head. */}
                  <span title={block.owner} style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: accentColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {shortAddr(block.owner)}
                  </span>
                </div>
                {isMine && <span className="badge badge-green">You</span>}
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Row l="Paid" v={`$${block.price}`} />
                <Row l="Acquired" v={timeAgo(block.purchasedAt)} />
              </div>
            </div>

            <MiniCertificate block={block} shareUrl={shareUrl} />

            {isMine ? (
              <>
                <button className="btn" style={{ width: '100%' }} onClick={() => openCustomizeModal(selectedKey)}>
                  ✎ Customize Block
                </button>

                {/* Share Tile button — Frame-style public page (2026 viral) */}
                <ShareTileButton tileKey={selectedKey} country={block?.country} />

                {/* Guardian deploy/manage button */}
                <button
                  onClick={() => openGuardianModal(selectedKey, 'deploy')}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 12,
                    background: guardian ? 'rgba(74,222,128,0.08)' : 'var(--s2)',
                    border: guardian ? '1px solid rgba(74,222,128,0.2)' : '1px solid var(--b0)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontSize: 13, fontWeight: 600,
                    color: guardian ? 'var(--green)' : 'var(--t2)',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <span>{guardian ? '🛡️' : '🛡'}</span>
                  {guardian
                    ? `Guardian · Lv.${guardian.level}`
                    : 'Deploy Guardian Agent'
                  }
                </button>
              </>
            ) : (
              <EnemyTileSection
                selectedKey={selectedKey}
                block={block}
                guardian={guardian}
                guardians={guardians}
                myBlocks={myBlocks}
                openGuardianModal={openGuardianModal}
                openRaidModal={openRaidModal}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Dynamic price panel (unowned tile) — emotion-first layout ────────────────

function DynamicPricePanel({ selectedKey, country, basePrice, scarcity, shownPrice, pricePct, openPurchaseModal, blocksToNext, regionPct, tx, ty }) {
  const loadTileContext = usePriceStore(s => s.loadTileContext)
  const [ctx, setCtx]  = useState(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showEvents, setShowEvents]       = useState(false)

  useEffect(() => {
    setCtx(null)
    if (!selectedKey) return
    loadTileContext(selectedKey, country, basePrice * scarcity).then(c => setCtx(c))
  }, [selectedKey, country, basePrice, scarcity, loadTileContext])

  const marketMult = ctx?.multiplier ?? 1.0
  const totalPrice = ctx ? ctx.final_price : shownPrice
  const events     = ctx?.events ?? []
  const marketUp   = marketMult >= 1
  const marketDelta = ((marketMult - 1) * 100).toFixed(1)

  const urgencyColor = regionPct > 60 ? '#f87171' : regionPct > 30 ? '#fbbf24' : '#4ade80'
  const urgencyText  = regionPct > 60
    ? `Hurry — over ${regionPct}% of this region is taken.`
    : regionPct > 30
    ? `${regionPct}% of this region already claimed.`
    : `Prices rise with every sale. ${blocksToNext.toLocaleString()} blocks to next tier.`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Scarcity bar — identity + urgency */}
      <div style={{ background: 'var(--s2)', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>
            🌍 This exact spot on Earth
          </span>
          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color: urgencyColor }}>
            {regionPct}% claimed
          </span>
        </div>
        <div style={{ height: 5, borderRadius: 5, background: 'var(--s4)', overflow: 'hidden', marginBottom: 7 }}>
          <div style={{
            height: '100%', borderRadius: 5,
            width: `${Math.min(100, regionPct)}%`,
            background: urgencyColor,
            transition: 'width 0.6s ease',
            boxShadow: `0 0 8px ${urgencyColor}66`,
          }} />
        </div>
        <p style={{ fontSize: 11, color: urgencyColor, margin: 0, fontWeight: 600, lineHeight: 1.4 }}>
          {urgencyText}
        </p>
      </div>

      {/* Price — big and confident */}
      <div style={{ background: 'var(--s2)', borderRadius: 12, padding: '14px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{
            fontSize: 36, fontWeight: 800, fontFamily: 'var(--mono)',
            letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--t1)',
          }}>
            ${totalPrice.toFixed(2)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 500 }}>USD</span>
          {ctx && marketMult !== 1.0 && (
            <span style={{
              fontSize: 10, fontWeight: 800, fontFamily: 'var(--mono)',
              color: marketUp ? 'var(--green)' : '#f87171',
              background: marketUp ? 'var(--green-d)' : 'rgba(248,113,113,0.1)',
              borderRadius: 4, padding: '1px 5px',
            }}>
              {marketUp ? '▲' : '▼'} {Math.abs(marketDelta)}% market
            </span>
          )}
        </div>

        {/* Breakdown toggle */}
        <button
          onClick={() => setShowBreakdown(b => !b)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--font)',
          }}
        >
          <span style={{ display: 'inline-block', transform: showBreakdown ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
          {showBreakdown ? 'Hide' : '+'} price breakdown
        </button>

        {showBreakdown && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 8, borderTop: '1px solid var(--b0)' }}>
            <Row l="Base price" v={`$${basePrice.toFixed(2)}`} />
            <Row l="Scarcity ×" v={`×${scarcity.toFixed(4)}`} />
            {ctx && <Row l="Market events ×" v={`×${marketMult.toFixed(4)}`} />}
            {events.length > 0 && (
              <>
                <button
                  onClick={() => setShowEvents(e => !e)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--font)' }}
                >
                  <span style={{ display: 'inline-block', transform: showEvents ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                  {showEvents ? 'Hide' : 'Show'} {events.length} market factor{events.length !== 1 ? 's' : ''}
                </button>
                {showEvents && events.map(e => {
                  const meta = SOURCE_META[e.source] || { icon: '•', color: '#888' }
                  const up   = e.multiplier >= 1
                  const pct  = ((e.multiplier - 1) * 100).toFixed(1)
                  return (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, background: 'var(--s3)' }}>
                      <span style={{ fontSize: 13, flexShrink: 0 }}>{meta.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.note}</div>
                        <div style={{ fontSize: 9, color: 'var(--t4)', marginTop: 1 }}>{e.event_type}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--mono)', color: up ? 'var(--green)' : '#f87171', flexShrink: 0 }}>{up ? '+' : ''}{pct}%</span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* CTA — big, unmissable */}
      <button className="btn" style={{ width: '100%', fontSize: 16, padding: '14px', fontWeight: 800, letterSpacing: '-0.01em' }} onClick={() => openPurchaseModal(totalPrice)}>
        Purchase — ${totalPrice.toFixed(2)}
      </button>
    </div>
  )
}

function Row({ l, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--t3)' }}>{l}</span>
      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--t2)' }}>{v}</span>
    </div>
  )
}

const iconBtnStyle = {
  width: 30, height: 30, borderRadius: 8,
  background: 'var(--s3)', border: 'none',
  color: 'var(--t2)', cursor: 'pointer', fontSize: 14,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.1s', WebkitTapHighlightColor: 'transparent',
}

// ── Enemy tile panel (non-owner view) ─────────────────────────────────────────

const PERSONALITY_META = {
  aggressive: { icon: '⚔️', color: '#f87171', label: 'Aggressive' },
  balanced:   { icon: '⚖️', color: '#60a5fa', label: 'Balanced'   },
  passive:    { icon: '🛡️', color: '#4ade80', label: 'Passive'    },
}

function EnemyTileSection({ selectedKey, block, guardian, guardians, myBlocks, openGuardianModal, openRaidModal }) {
  const [fullGuardian, setFullGuardian] = useState(null)
  const [offerSent, setOfferSent]       = useState(false)
  const [offerAmount, setOfferAmount]   = useState(5)
  const [negotiating, setNegotiating]   = useState(false)
  const [negotiateResult, setNegotiateResult] = useState(null)

  // Load full guardian stats when we have a summary entry
  useEffect(() => {
    setFullGuardian(null)
    setOfferSent(false)
    setNegotiateResult(null)
    if (!guardian || !selectedKey) return
    api.fetchGuardian(selectedKey)
      .then(g => setFullGuardian(g))
      .catch(() => {})
  }, [selectedKey, guardian])

  const pm = guardian ? (PERSONALITY_META[guardian.personality] ?? PERSONALITY_META.balanced) : null

  // Simulated negotiation — agent responds based on personality
  function handleNegotiate() {
    if (!fullGuardian || negotiating) return
    setNegotiating(true)
    setTimeout(() => {
      const p = fullGuardian.personality
      const rentSuggested = fullGuardian.daily_yield
        ? parseFloat((fullGuardian.daily_yield * 8).toFixed(3))
        : parseFloat(offerAmount)

      let response, accepted
      if (p === 'aggressive') {
        // Aggressive agents counter-offer high or reject low offers
        accepted = offerAmount >= rentSuggested * 0.85
        response = accepted
          ? `Deal accepted. Rent rights granted for 24h. Guardian will verify payment on-chain.`
          : `Offer rejected. Minimum acceptable rent is $${rentSuggested.toFixed(2)}/day. Counter-offer submitted.`
      } else if (p === 'balanced') {
        accepted = offerAmount >= rentSuggested * 0.7
        response = accepted
          ? `Agent accepts your offer of $${offerAmount}. Display rights active for 24h.`
          : `Agent is considering. Suggested rate: $${rentSuggested.toFixed(2)}/day. Raise your offer.`
      } else {
        // Passive agents accept lower offers
        accepted = offerAmount >= rentSuggested * 0.5
        response = accepted
          ? `Guardian approved your rental offer. Territory display rights granted.`
          : `Guardian declined. Try offering at least $${(rentSuggested * 0.5).toFixed(2)}.`
      }

      setNegotiateResult({ accepted, response, rentSuggested })
      setNegotiating(false)
    }, 1200)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Guardian status card */}
      {guardian && pm ? (
        <div style={{
          borderRadius: 12, overflow: 'hidden',
          border: `1px solid ${pm.color}20`,
          background: `${pm.color}08`,
        }}>
          {/* Guardian header */}
          <div style={{
            padding: '10px 13px',
            borderBottom: `1px solid ${pm.color}15`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: `${pm.color}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>{pm.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: pm.color }}>
                {pm.icon} {pm.label} Guardian
              </div>
              <div title={block.owner} style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Level {guardian.level} · {shortAddr(block.owner)}
              </div>
            </div>
            <div style={{
              padding: '3px 8px', borderRadius: 99,
              background: `${pm.color}15`,
              fontSize: 10, fontWeight: 700, color: pm.color,
              flexShrink: 0,
            }}>ACTIVE</div>
          </div>

          {/* Guardian stats */}
          {fullGuardian && (
            <div style={{ padding: '10px 13px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                ['ATK', fullGuardian.atk?.toFixed(1), '#f87171'],
                ['DEF', fullGuardian.def?.toFixed(1), '#60a5fa'],
                ['$/day', fullGuardian.daily_yield?.toFixed(3), '#4ade80'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
                  <div className="label" style={{ marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          )}
          {!fullGuardian && (
            <div style={{ padding: '14px', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--s4)', borderTopColor: pm.color, animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}
        </div>
      ) : (
        <div style={{
          padding: '11px 14px', borderRadius: 10,
          background: 'var(--s2)',
          fontSize: 12, color: 'var(--t3)', textAlign: 'center',
        }}>
          No guardian deployed — tile is unprotected
        </div>
      )}

      {/* Negotiate with agent */}
      {guardian && fullGuardian && (
        <div style={{
          borderRadius: 12, background: 'var(--s2)',
          border: '1px solid var(--b0)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 13px',
            borderBottom: '1px solid var(--b0)',
            fontSize: 12, fontWeight: 700, color: 'var(--t1)',
          }}>
            💬 Negotiate with Agent
          </div>
          <div style={{ padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.55 }}>
              Offer to rent this tile's display rights. The guardian agent will auto-respond based on its personality and target yield.
            </div>

            {!negotiateResult ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1,
                    background: 'var(--s3)', borderRadius: 8, padding: '7px 10px',
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--t3)', flexShrink: 0 }}>$</span>
                    <input
                      type="number" min="0.5" max="999" step="0.5"
                      value={offerAmount}
                      onChange={e => setOfferAmount(parseFloat(e.target.value) || 1)}
                      className="allow-select"
                      style={{
                        background: 'none', border: 'none', outline: 'none',
                        fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700,
                        color: 'var(--t1)', width: '100%',
                      }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>/day</span>
                  </div>
                  <button
                    onClick={handleNegotiate}
                    disabled={negotiating}
                    style={{
                      padding: '8px 14px', borderRadius: 8, flexShrink: 0,
                      background: 'var(--green-d)', border: '1px solid var(--green-b)',
                      color: 'var(--green)', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', opacity: negotiating ? 0.6 : 1,
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {negotiating ? '…' : 'Send Offer'}
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                  Agent target rate: ~${(fullGuardian.daily_yield * 8).toFixed(2)}/day
                </div>
              </>
            ) : (
              <div style={{
                padding: '10px 12px', borderRadius: 9,
                background: negotiateResult.accepted ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.06)',
                border: `1px solid ${negotiateResult.accepted ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.15)'}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: negotiateResult.accepted ? 'var(--green)' : 'var(--red)', marginBottom: 5 }}>
                  {negotiateResult.accepted ? '✓ Offer Accepted' : '✗ Offer Rejected'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.55 }}>
                  {negotiateResult.response}
                </div>
                <button
                  onClick={() => setNegotiateResult(null)}
                  style={{ marginTop: 8, fontSize: 10, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font)' }}
                >
                  ↩ New offer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Raid button */}
      {guardian && (
        <button
          onClick={() => {
            const myGuardianKey = [...myBlocks].find(k => guardians.has(k))
            if (!myGuardianKey) {
              openGuardianModal(selectedKey, 'deploy')
              return
            }
            openRaidModal(myGuardianKey)
            useGuardianStore.setState(s => ({
              raidModal: { ...s.raidModal, defenderKey: selectedKey }
            }))
          }}
          style={{
            width: '100%', padding: '10px', borderRadius: 12,
            background: 'rgba(248,113,113,0.05)',
            border: '1px solid rgba(248,113,113,0.12)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 13, fontWeight: 600, color: '#f87171',
          }}
        >
          ⚔️ Raid this tile
        </button>
      )}

      {/* No guardian — plain owned message */}
      {!guardian && (
        <div style={{ padding: '11px 14px', borderRadius: 10, textAlign: 'center', background: 'var(--s2)', fontSize: 12, color: 'var(--t3)' }}>
          This block is already owned
        </div>
      )}
    </div>
  )
}

// ── ShareTileButton — Frame-URL share (2026 viral) ──────────────────────────
function ShareTileButton({ tileKey, country }) {
  const [copied, setCopied] = useState(false)
  const onShare = async () => {
    if (!tileKey) return
    const base = window.location.origin
    const url = `${base}/t/${tileKey}`
    const text = `Just claimed ${country || 'a tile'} on CryptoLand · ${url}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'CryptoLand', text, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch {}
  }
  return (
    <button
      onClick={onShare}
      title="Share a public Frame page for this tile"
      style={{
        width: '100%', padding: '10px', borderRadius: 12,
        background: 'var(--s2)',
        border: '1px solid var(--b0)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontSize: 13, fontWeight: 600, color: 'var(--t2)',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      <span style={{ fontSize: 14 }}>{copied ? '✓' : '↗'}</span>
      <span>{copied ? 'Link copied' : 'Share Tile · public page'}</span>
    </button>
  )
}
