import { escapeHtml } from './shared-helpers.js';

export const COMMUNICATION_TEMPLATE_VERSION = 1;

export const PROJECT_VARIABLE_DEFINITIONS = [
  { key: 'project.id', label: 'Project ID', category: 'Project' },
  { key: 'project.projectName', label: 'Projectnaam', category: 'Project', example: 'Familie Peeters' },
  { key: 'project.customerName', label: 'Klantnaam', category: 'Project', example: 'Jan Peeters' },
  { key: 'project.status', label: 'Status', category: 'Project' },
  { key: 'project.createdBy', label: 'Aangemaakt door', category: 'Project' },
  { key: 'project.createdAt', label: 'Aangemaakt op', category: 'Project', type: 'date' },
  { key: 'project.updatedAt', label: 'Laatst aangepast op', category: 'Project', type: 'date' },
  { key: 'project.customer.email', label: 'E-mail klant', category: 'Klant' },
  { key: 'project.customer.phone', label: 'Telefoon klant', category: 'Klant' },
  { key: 'project.customer.address', label: 'Adres volledig', category: 'Klant' },
  { key: 'project.customer.addressStructured.street', label: 'Straat', category: 'Klant' },
  { key: 'project.customer.addressStructured.houseNumber', label: 'Huisnummer', category: 'Klant' },
  { key: 'project.customer.addressStructured.bus', label: 'Bus', category: 'Klant' },
  { key: 'project.customer.addressStructured.postalCode', label: 'Postcode', category: 'Klant' },
  { key: 'project.customer.addressStructured.city', label: 'Gemeente/stad', category: 'Klant' },
  { key: 'project.customer.addressStructured.countryCode', label: 'Landcode', category: 'Klant' },
  { key: 'project.situation', label: 'Situatie', category: 'Notities' },
  { key: 'project.notes', label: 'Algemene notities', category: 'Notities' },
  { key: 'project.planning.visitPlannedDate', label: 'Plaatsbezoek ingepland', category: 'Planning', type: 'date' },
  { key: 'project.planning.visitDoneDate', label: 'Plaatsbezoek uitgevoerd', category: 'Planning', type: 'date' },
  { key: 'project.planning.installationPlannedDate', label: 'Installatie ingepland', category: 'Planning', type: 'date' },
  { key: 'project.planning.installationDoneDate', label: 'Installatie uitgevoerd', category: 'Planning', type: 'date' },
  { key: 'project.planning.inspectionPlannedDate', label: 'Keuring ingepland', category: 'Planning', type: 'date' },
  { key: 'project.planning.inspectionDoneDate', label: 'Keuring uitgevoerd', category: 'Planning', type: 'date' },
  { key: 'project.site.houseAgeOver10Years', label: 'Woning ouder dan 10 jaar', category: 'Woning', type: 'boolean' },
  { key: 'project.electrical.connectionType', label: 'Aansluitingstype', category: 'Elektrisch' },
  { key: 'project.electrical.fuseRatingA', label: 'Hoofdzekering A', category: 'Elektrisch' },
  { key: 'project.cabinet.freeUnits', label: 'Vrije modules zekeringkast', category: 'Zekeringkast' },
  { key: 'project.cabinet.hasRemAutomaat', label: 'REM-automaat aanwezig', category: 'Zekeringkast', type: 'boolean' },
  { key: 'project.cabinet.wiringDiameterMm2', label: 'Draaddiameter mm²', category: 'Zekeringkast' },
  { key: 'project.cabinet.hasOutletNearFluvius', label: 'Stopcontact bij Fluvius-meter', category: 'Zekeringkast', type: 'boolean' },
  { key: 'project.cabinet.hasWifiNearFluvius', label: 'Wifi bij Fluvius-meter', category: 'Zekeringkast', type: 'boolean' },
  { key: 'project.cabinet.batteryPlacementRoom', label: 'Plaats batterij', category: 'Zekeringkast' },
  { key: 'project.cabinet.hasWifiNearCabinet', label: 'Wifi bij zekeringkast', category: 'Zekeringkast', type: 'boolean' },
  { key: 'project.cabinet.lineGroundChecked', label: 'Aarding/lijn gecontroleerd', category: 'Zekeringkast', type: 'boolean' },
  { key: 'project.solar.inverters', label: 'Zonnepanelenomvormers', category: 'Zonnepanelen', type: 'json' },
  { key: 'project.technical.earthResistanceMeasured', label: 'Aarding gemeten', category: 'Technisch', type: 'boolean' },
  { key: 'project.technical.earthResistanceOhm', label: 'Aardingsweerstand Ω', category: 'Technisch' },
  { key: 'project.technical.earthResistanceMeasuredDate', label: 'Datum aardingsmeting', category: 'Technisch', type: 'date' },
  { key: 'project.technical.voltageMeasurements', label: 'Spanningsmetingen', category: 'Technisch', type: 'json' },
  { key: 'project.technical.technicalNotes', label: 'Technische notities', category: 'Technisch' },
  { key: 'project.inspection.company', label: 'Keuringsfirma', category: 'Keuring' },
  { key: 'project.inspection.reference', label: 'Keuringsreferentie', category: 'Keuring' },
  { key: 'project.inspection.notes', label: 'Keuring opmerkingen', category: 'Keuring' },
  { key: 'project.supplier.name', label: 'Leveranciernaam', category: 'Energieprijs' },
  { key: 'project.supplier.isSingleTariff', label: 'Enkel tarief', category: 'Energieprijs', type: 'boolean' },
  { key: 'project.supplier.priceDay', label: 'Prijs dag/enkel €/kWh', category: 'Energieprijs' },
  { key: 'project.supplier.priceNight', label: 'Prijs nacht €/kWh', category: 'Energieprijs' },
  { key: 'project.calcDefaults.keuring', label: 'Keuring in calculatie', category: 'Calculatie' },
  { key: 'project.csvUpload.uploadedAt', label: 'CSV geüpload op', category: 'Fluvius CSV', type: 'date' },
  { key: 'project.csvUpload.eanCode', label: 'EAN-code', category: 'Fluvius CSV' },
  { key: 'project.csvUpload.meterNr', label: 'Meternummer', category: 'Fluvius CSV' },
  { key: 'project.csvUpload.meterType', label: 'Metertype', category: 'Fluvius CSV' },
  { key: 'project.lastCalcRun', label: 'Laatste berekening', category: 'Calculatie', type: 'json' },
  { key: 'project.offertes', label: 'Offertes', category: 'Offertes', type: 'json' },
  { key: 'project.manualConfigs', label: 'Manuele configuraties', category: 'Offertes', type: 'json' },
  { key: 'project.filesInbox', label: 'Inbox bestanden', category: 'Backoffice', type: 'json' },
  { key: 'project.batteryRegistry.bebatStatus', label: 'Bebat status algemeen', category: 'Bebat' },
  { key: 'project.batteryRegistry.entries', label: 'Bebat entries', category: 'Bebat', type: 'json' },
  { key: 'project.serialNumbers', label: 'Serienummers', category: 'Materiaal', type: 'json' },
  { key: 'project.installedSolution.items', label: 'Geplaatste oplossing items', category: 'Geplaatste oplossing', type: 'json' },
];

export const DEFAULT_INTAKE_TEMPLATE = {
  id: 'intake-thuisbatterij',
  name: 'Intake thuisbatterij',
  category: 'intake',
  subject: 'Gegevens voor voorstel thuisbatterij',
  description: 'Eerste gegevensopvraag voor klanten die interesse tonen in een thuisbatterij of energieoptimalisatie.',
  isSystemDefault: true,
  style: {
    brandColor: '#0d6efd',
    accentColor: '#00b478',
    backgroundColor: '#f4f7fb',
    cardColor: '#ffffff',
    textColor: '#172033',
    mutedColor: '#667085',
    fontFamily: 'Arial, Helvetica, sans-serif',
    borderRadius: 18,
    customCss: '',
  },
  variables: [
    { key: 'voornaam', label: 'Voornaam klant', fallback: 'voornaam' },
    { key: 'context', label: 'Korte persoonlijke context', fallback: 'je aanvraag rond een thuisbatterij' },
    { key: 'planning', label: 'Planning/afspraak indien relevant', fallback: '' },
  ],
  blocks: [
    {
      id: 'intro',
      type: 'paragraph',
      title: 'Intro',
      text: 'Dag {{voornaam}},\n\nBedankt voor {{context}}. Om een correcte inschatting te kunnen maken, verzamelen we graag eerst de gegevens die hieronder staan. Mogelijk heb je intussen al een deel hiervan doorgestuurd; dat is uiteraard prima. Zie deze mail vooral als het volledige overzicht van de info die we idealiter gebruiken om technisch en financieel juist te kunnen inschatten welke oplossing zinvol is.',
    },
    {
      id: 'why',
      type: 'callout',
      title: 'Waarom deze info?',
      text: 'Hoe meer gegevens we vooraf hebben, hoe gerichter we kunnen werken. Zo vermijden we onnodige verplaatsingen, kunnen we de juiste batterij-opstelling kiezen en zien we sneller of een thuisbatterij in jouw situatie ook echt interessant is.',
    },
    {
      id: 'myfluvius',
      type: 'checklist',
      title: '1. Verbruiksdata via MyFluvius',
      text: 'Het belangrijkste zijn de historische verbruiks- en injectiegegevens uit MyFluvius. Kies liefst een zo lang mogelijke periode, idealiter minstens één volledig jaar.',
      items: [
        'Historische data exporteren als CSV-bestand',
        'Detailniveau op dagtotalen zetten',
        'Zowel afname als injectie meesturen',
        'Indien mogelijk ook de historiek van het piekvermogen meesturen',
        'Als de P1-poort nog niet actief staat: die alvast activeren via MyFluvius',
      ],
    },
    {
      id: 'solar',
      type: 'checklist',
      title: '2. Zonnepanelen en omvormer',
      text: 'Voor de keuze van batterij en omvormer moeten we weten wat er vandaag al aanwezig is.',
      items: [
        'Vermogen of aantal zonnepanelen, indien gekend',
        'Merk en type van de zonnepanelenomvormer',
        'Duidelijke foto van het typeplaatje van de omvormer',
        'Bouwjaar van de installatie',
        'Of de zonnepaneleninstallatie gekeurd is',
      ],
    },
    {
      id: 'home',
      type: 'checklist',
      title: '3. Woning, aansluiting en situatie',
      text: 'Deze gegevens helpen om het btw-tarief, de technische aansluiting en de praktische plaatsing juist in te schatten.',
      items: [
        'Of de woning ouder is dan 10 jaar',
        'Of er een digitale meter aanwezig is',
        'Of je aansluiting eenfasig, 3 x 230 V of 3 x 400 V + N is, als je dat weet',
        'Of er wifi beschikbaar is bij de digitale meter, zekeringkast en mogelijke batterijplaats',
        'Of er een vrij stopcontact aanwezig is bij de digitale meter',
      ],
    },
    {
      id: 'photos',
      type: 'checklist',
      title: '4. Foto’s en documenten',
      text: 'Foto’s hoeven niet professioneel te zijn. Duidelijke overzichtsfoto’s zijn meestal al voldoende om veel vooraf te kunnen beoordelen.',
      items: [
        'Digitale meter en de ruimte errond',
        'Zekeringkast, liefst overzichtelijk en veilig gefotografeerd',
        'Zonnepanelenomvormer en typeplaatje',
        'Mogelijke plaats waar de batterij zou kunnen komen',
        'Keuringsverslag en elektrische schema’s, als die snel beschikbaar zijn',
      ],
    },
    {
      id: 'price',
      type: 'paragraph',
      title: '5. Energieprijs',
      text: 'Voor de terugverdientijd is de totale elektriciteitsprijs per kWh belangrijk, inclusief taksen, nettarieven en andere kosten. Als je die prijs kent, mag je die gerust doorgeven. Je mag ook een recente afrekening meesturen; dan rekenen wij dit zelf even uit. Als dat niet meteen lukt, gebruiken we voorlopig een realistische richtwaarde en verfijnen we die later.',
    },
    {
      id: 'reassurance',
      type: 'callout',
      title: 'Niet alles moet meteen perfect zijn',
      text: 'Lukt het niet om alles onmiddellijk te bezorgen, dan is dat zeker geen probleem. Stuur gerust al door wat beschikbaar is. Wat ontbreekt, kunnen we later telefonisch of tijdens een plaatsbezoek samen bekijken.',
    },
    {
      id: 'closing',
      type: 'paragraph',
      title: 'Afsluiter',
      text: 'Zodra we de gegevens ontvangen hebben, bekijken we welke opstellingen technisch mogelijk en financieel interessant zijn. Daarna kunnen we de volgende stap bepalen: een gerichte berekening, voorstel of plaatsbezoek.\n\nAlvast bedankt.\n\nMet vriendelijke groeten,\nKevin\nSmartPeak',
    },
  ],
};

const ADDITIONAL_DEFAULT_TEMPLATES = [
  makeDefaultTemplate({
    id: 'intake-na-plaatsbezoek',
    name: 'Intake na plaatsbezoek',
    subject: 'Aanvullende gegevens na plaatsbezoek',
    description: 'Opvolgmail na een bezoek ter plaatse, met focus op ontbrekende data zonder opnieuw alles generiek te vragen.',
    blocks: [
      p('intro', 'Intro', 'Dag {{voornaam}},\n\nMerci om mij te ontvangen. Op basis van wat we ter plaatse bekeken hebben, kunnen we al een stuk gerichter inschatten wat technisch mogelijk is. Voor de berekening zelf ontbreekt meestal nog vooral de verbruiksdata en eventueel wat extra technische info.'),
      c('focus', 'Wat we nog zoeken', 'Mogelijk heb je intussen al een deel bezorgd. Hieronder staat vooral het overzicht van wat nog nuttig is om de analyse correct te maken.'),
      l('missing-data', 'Belangrijkste ontbrekende info', 'Voor de eerste berekening zijn vooral deze zaken belangrijk.', ['MyFluvius historische data op dagtotalen', 'Indien mogelijk piekverbruik', 'Duidelijke foto van typeplaatje(s) van de omvormer(s)', 'Recente afrekening of totale elektriciteitsprijs per kWh', 'Eventueel keuringsverslag of schema’s als die snel beschikbaar zijn']),
      p('closing', 'Volgende stap', 'Bezorg gerust wat al beschikbaar is. Wat ontbreekt, kunnen we later nog aanvullen of samen bekijken. Zodra ik de belangrijkste gegevens heb, werk ik de berekening verder uit.\n\nGroeten,\nKevin'),
    ],
  }),
  makeDefaultTemplate({
    id: 'reminder-myfluvius-data',
    name: 'Reminder MyFluvius-data ontbreekt',
    subject: 'Nog even navragen voor de thuisbatterij-analyse',
    description: 'Zachte opvolging wanneer klant nog geen data/info bezorgde.',
    blocks: [
      p('intro', 'Intro', 'Dag {{voornaam}},\n\nIk wou even kort navragen of mijn vorige mail goed is toegekomen. Het kan natuurlijk altijd dat die ergens tussen de mails is blijven hangen.'),
      p('ask', 'Vraag', 'Als jullie nog graag willen dat we dit verder bekijken, mag je ons alsnog de MyFluvius-data en de ontbrekende installatiegegevens bezorgen. Met die gegevens kunnen we de berekening correcter en sneller maken.'),
      c('no-pressure', 'Geen druk', 'Mochten jullie intussen beslist hebben om hier voorlopig niet mee verder te gaan, dan is dat uiteraard ook helemaal oké. Laat dat gerust gewoon even weten, dan weten wij ook dat we dit niet verder moeten opvolgen.'),
      p('closing', 'Afsluiter', 'Alvast bedankt.\n\nVriendelijke groeten,\nKevin\nSmartPeak'),
    ],
  }),
  makeDefaultTemplate({
    id: 'berekening-klaar',
    name: 'Voorstel / berekening klaar',
    subject: 'Voorlopige berekening thuisbatterij',
    description: 'Mail om ROI-link of eerste analyse naar klant te sturen.',
    blocks: [
      p('intro', 'Intro', 'Dag {{voornaam}},\n\nIk heb op basis van de gegevens die we ontvingen een eerste berekening gemaakt. Je kan de vergelijking hier bekijken: {{berekeningLink}}'),
      c('conclusion', 'Korte conclusie', 'Op basis van de huidige gegevens lijkt vooral {{aanbevolenOptie}} interessant om verder te bekijken. De exacte keuze hangt natuurlijk af van hoe ruim je vandaag wil zitten en of je verwacht dat je verbruik later nog stijgt.'),
      p('scenario', 'Voorzichtige berekening', 'Onze berekening is bewust vrij voorzichtig opgebouwd. We houden rekening met beperkingen zoals verhouding tussen zonnepanelenomvormer en batterij-omvormer, batterijrendement en hoeveel opgeslagen energie dezelfde dag nog nuttig gebruikt kan worden.'),
      p('next', 'Volgende stap', 'Bekijk dit gerust rustig. Als je wil, overlopen we de cijfers samen en kan ik daarna een concrete offerte opmaken voor de optie die het meest logisch lijkt.\n\nGroeten,\nKevin'),
    ],
  }),
  makeDefaultTemplate({
    id: 'offerte-verzenden',
    name: 'Offerte verzenden',
    subject: 'Offerte thuisbatterij SmartPeak',
    description: 'Mail voor officiële offerte-PDF of aangepaste offerte.',
    blocks: [
      p('intro', 'Intro', 'Dag {{voornaam}},\n\nIn bijlage vind je de offerte voor de besproken thuisbatterij-opstelling.'),
      p('scope', 'Wat zit inbegrepen?', 'De installatieprijs is voorzien als totaalprijs voor normale omstandigheden zoals we ze besproken of ter plaatse bekeken hebben. Daarin zitten installatie, configuratie, elektrische schema’s, keuring, werkuren en het nodige materiaal inbegrepen.'),
      c('extras', 'Onvoorziene zaken', 'We verwachten op basis van de huidige info normaal geen bijkomende kosten. Mocht er toch iets onvoorzien naar boven komen dat echt extra werk of materiaal vraagt, dan bekijken we dat pro rata en uiteraard altijd eerst in overleg.'),
      p('acceptance', 'Akkoord geven', 'Als dit voor jou akkoord is, mag je dat gewoon per mail bevestigen. Ondertekenen en terugsturen mag ook, maar is niet noodzakelijk tenzij je dat zelf makkelijker vindt.\n\nVriendelijke groeten,\nKevin'),
    ],
  }),
  makeDefaultTemplate({
    id: 'akkoord-ontvangen',
    name: 'Akkoord ontvangen / voorschot volgt',
    subject: 'Akkoord ontvangen – volgende stap',
    description: 'Bevestiging na akkoord van klant, voor materiaalbestelling/planning.',
    blocks: [
      p('intro', 'Intro', 'Dag {{voornaam}},\n\nBedankt voor je bevestiging. We hebben het akkoord goed ontvangen.'),
      p('next', 'Volgende stap', 'De volgende stap is dat we de voorschotfactuur opmaken. Na ontvangst daarvan kunnen we het materiaal bestellen en de installatie verder inplannen.'),
      c('planning', 'Planning', 'De exacte timing stemmen we verder af zodra er voldoende zicht is op materiaal en agenda. Als er intussen praktische voorkeuren of beperkingen zijn, mag je die gerust al doorgeven.'),
      p('closing', 'Afsluiter', 'We houden je verder op de hoogte.\n\nGroeten,\nKevin'),
    ],
  }),
  makeDefaultTemplate({
    id: 'voorschotfactuur',
    name: 'Voorschotfactuur verzenden',
    subject: 'Voorschotfactuur thuisbatterij',
    description: 'Mail voor voorschotfactuur met Blox-it/SmartPeak banknaamnuance.',
    blocks: [
      p('intro', 'Intro', 'Dag {{voornaam}},\n\nIn bijlage vind je de voorschotfactuur voor de bestelling en verdere planning van de installatie.'),
      c('bank-name', 'Naam bij betaling', 'SmartPeak werkt onder Blox-it BV. Het kan dus zijn dat je bank bij de naamcontrole Blox-it BV toont in plaats van SmartPeak. Dat is normaal en hoort bij dezelfde btw-structuur.'),
      p('after-payment', 'Na betaling', 'Na ontvangst van het voorschot kunnen we het materiaal definitief bestellen en de planning concreet verder afstemmen.'),
      p('closing', 'Afsluiter', 'Als er nog iets onduidelijk is, laat gerust iets weten.\n\nVriendelijke groeten,\nKevin'),
    ],
  }),
  makeDefaultTemplate({
    id: 'installatieplanning-bevestigen',
    name: 'Installatieplanning bevestigen',
    subject: 'Bevestiging installatie thuisbatterij',
    description: 'Bevestiging van installatie-afspraak en praktische voorbereiding.',
    blocks: [
      p('intro', 'Intro', 'Dag {{voornaam}},\n\nZoals besproken bevestigen we hierbij de installatie van de thuisbatterij op {{installatieDatum}}.'),
      l('prep', 'Praktisch vooraf', 'Om vlot te kunnen werken, is het handig als volgende zaken in orde zijn.', ['Vrije toegang tot de zekeringkast en digitale meter', 'De plaats waar de batterij komt zo goed mogelijk vrijmaken', 'Wifi beschikbaar in de buurt van meter/kast/batterij', 'P1-poort vooraf activeren als dat nog niet gebeurd is', 'Eventuele documenten of schema’s klaarleggen als die beschikbaar zijn']),
      c('timing', 'Timing', 'Het exacte uur kan soms nog licht wijzigen door planning of verkeer. Als er iets verandert, laten we dat uiteraard weten.'),
      p('closing', 'Afsluiter', 'Tot dan.\n\nGroeten,\nKevin'),
    ],
  }),
  makeDefaultTemplate({
    id: 'keuring-inplannen',
    name: 'Keuring inplannen / communiceren',
    subject: 'Keuring thuisbatterij',
    description: 'Mail rond keuringsaanvraag, planning of uurvenster.',
    blocks: [
      p('intro', 'Intro', 'Dag {{voornaam}},\n\nDe installatie is klaar voor de keuring. We volgen de planning hiervan verder op.'),
      p('timing', 'Timing', 'Het exacte uur van de keurder is niet altijd meteen duidelijk. Zodra we meer info hebben, geven we die zo snel mogelijk door. Reken best wel op wat marge rond het meegedeelde uur.'),
      c('presence', 'Aanwezigheid', 'Meestal is het vooral belangrijk dat de keurder toegang heeft tot de installatie, zekeringkast en documenten. Als er iets specifieks nodig is, laten we dat vooraf weten.'),
      p('closing', 'Afsluiter', 'We houden je op de hoogte.\n\nVriendelijke groeten,\nKevin'),
    ],
  }),
  makeDefaultTemplate({
    id: 'na-installatie-opvolging',
    name: 'Na installatie opvolging',
    subject: 'Opvolging na installatie thuisbatterij',
    description: 'Korte mail na installatie met opvolging en volgende stappen.',
    blocks: [
      p('intro', 'Intro', 'Dag {{voornaam}},\n\nDe installatie is intussen geplaatst. We volgen de werking nog verder op zodat alles correct draait.'),
      l('next', 'Wat volgt er nog?', 'Afhankelijk van het dossier kunnen deze stappen nog openstaan.', ['Controle van monitoring/app', 'Eventuele P1- of EMS-instellingen nakijken', 'Keuring of keuringsverslag opvolgen', 'Eventuele documenten of schema’s bezorgen', 'Eindfactuur of afsluitdossier bezorgen']),
      c('support', 'Vragen', 'Merk je iets op dat niet duidelijk is of waarvan je twijfelt of het normaal is, laat gerust iets weten. Dan bekijken we dat samen.'),
      p('closing', 'Afsluiter', 'Bedankt alvast voor het vertrouwen.\n\nGroeten,\nKevin'),
    ],
  }),
  makeDefaultTemplate({
    id: 'afsluitdossier-factuur-review',
    name: 'Afsluitdossier / factuur / review',
    subject: 'Factuur en afsluitdossier',
    description: 'Mail met eindfactuur, documenten en eventueel reviewvraag.',
    blocks: [
      p('intro', 'Intro', 'Dag {{voornaam}},\n\nIn bijlage of via de meegestuurde link vind je de documenten rond de afgewerkte installatie.'),
      l('included', 'Inhoud', 'Afhankelijk van het dossier kan dit onder meer bevatten:', ['Eindfactuur', 'Keuringsverslag', 'Elektrische schema’s', 'Foto’s of overzicht van de installatie', 'Andere relevante documenten voor het dossier']),
      p('review', 'Review', 'Als je tevreden bent over de samenwerking, appreciëren we het enorm als je eventueel een korte review wil nalaten. Dat helpt ons als kleine onderneming echt vooruit.'),
      p('closing', 'Afsluiter', 'Als er nog iets ontbreekt of onduidelijk is, laat gerust iets weten.\n\nVriendelijke groeten,\nKevin'),
    ],
  }),
  makeDefaultTemplate({
    id: 'niet-rendabel',
    name: 'Niet rendabel / voorlopig niet interessant',
    subject: 'Eerste inschatting thuisbatterij',
    description: 'Transparante mail wanneer een batterij voorlopig niet voldoende interessant lijkt.',
    blocks: [
      p('intro', 'Intro', 'Dag {{voornaam}},\n\nIk heb de gegevens bekeken en wil hier graag transparant in zijn: op basis van de huidige cijfers lijkt een thuisbatterij voorlopig niet automatisch de meest interessante investering.'),
      p('why', 'Waarom', 'Dat kan bijvoorbeeld komen door een laag elektriciteitsverbruik, beperkte injectie, een minder passend verbruiksprofiel of omdat de terugverdientijd te lang uitkomt in verhouding tot de investering.'),
      c('honest', 'Eerlijk advies', 'We stellen liever niets voor als de meerwaarde vandaag te beperkt lijkt. Mocht je verbruik later stijgen, bijvoorbeeld door elektrische wagen, warmtepomp of andere elektrificatie, dan kan de situatie opnieuw veranderen.'),
      p('closing', 'Afsluiter', 'Als je wil, kan ik de redenering gerust kort toelichten of later opnieuw bekijken wanneer er nieuwe gegevens zijn.\n\nVriendelijke groeten,\nKevin'),
    ],
  }),
  makeDefaultTemplate({
    id: 'geen-zonnepanelen',
    name: 'Geen zonnepanelen / eerst PV bekijken',
    subject: 'Thuisbatterij zonder zonnepanelen',
    description: 'Voor leads zonder zonnepanelen, met voorzichtige nuance rond dynamische tarieven.',
    blocks: [
      p('intro', 'Intro', 'Dag {{voornaam}},\n\nIk zie dat je momenteel nog geen zonnepanelen hebt. Dat is op zich geen probleem, maar een thuisbatterij is in de meeste situaties vooral interessant in combinatie met zonnepanelen.'),
      p('context', 'Context', 'Met zonnepanelen kan je eigen opgewekte stroom opslaan en later gebruiken. Zonder zonnepanelen moet een batterij vooral inspelen op prijsverschillen of andere sturing, en in de praktijk is dat niet altijd voldoende om de investering alleen daarop te verantwoorden.'),
      c('pv-first', 'Eerst zonnepanelen bekijken?', 'Daarom bekijken we best eerst of zonnepanelen nu of op termijn een optie zijn. Als dat interessant lijkt, kunnen we daarna de combinatie met een batterij veel correcter beoordelen.'),
      p('closing', 'Afsluiter', 'Als je wil, mag je gerust wat info doorsturen over je dak, verbruik en situatie. Dan bekijken we welke richting het meest logisch is.\n\nVriendelijke groeten,\nKevin'),
    ],
  }),
];

function makeDefaultTemplate({ id, name, subject, description, blocks }) {
  return {
    ...cloneTemplate(DEFAULT_INTAKE_TEMPLATE),
    id,
    name,
    category: 'smartpeak-mail',
    subject,
    description,
    isSystemDefault: true,
    blocks,
  };
}

function p(id, title, text) {
  return { id, type: 'paragraph', title, text };
}

function c(id, title, text) {
  return { id, type: 'callout', title, text };
}

function l(id, title, text, items) {
  return { id, type: 'checklist', title, text, items };
}

export function defaultCommunicationTemplates() {
  return [DEFAULT_INTAKE_TEMPLATE, ...ADDITIONAL_DEFAULT_TEMPLATES].map(cloneTemplate);
}

function cloneTemplate(template) {
  return JSON.parse(JSON.stringify(template));
}

export function normalizeTemplate(template = {}) {
  const base = cloneTemplate(DEFAULT_INTAKE_TEMPLATE);
  const blocks = Array.isArray(template.blocks) ? template.blocks : base.blocks;
  return {
    ...base,
    ...template,
    id: template.id || base.id,
    name: template.name || base.name,
    subject: template.subject || base.subject,
    style: { ...base.style, ...(template.style || {}) },
    variables: Array.isArray(template.variables) ? template.variables : base.variables,
    blocks: blocks.map((block, index) => normalizeBlock(block, index)),
  };
}

export function normalizeBlock(block = {}, index = 0) {
  const type = ['paragraph', 'callout', 'checklist', 'spacer'].includes(block.type) ? block.type : 'paragraph';
  return {
    id: block.id || `block_${index + 1}`,
    type,
    title: block.title || '',
    text: block.text || '',
    items: Array.isArray(block.items) ? block.items.map(item => String(item || '').trim()).filter(Boolean) : [],
  };
}

function getPathValue(source, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (current == null || typeof current !== 'object' || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function formatVariableValue(value, definition = {}) {
  if (value == null || value === '') return '';
  if (definition.type === 'boolean' || typeof value === 'boolean') return value ? 'ja' : 'nee';
  if (definition.type === 'json' || Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function flattenScalarProjectValues(value, prefix = 'project', output = {}) {
  if (value == null) return output;
  if (Array.isArray(value)) {
    output[prefix] = JSON.stringify(value);
    return output;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => flattenScalarProjectValues(child, `${prefix}.${key}`, output));
    return output;
  }
  output[prefix] = formatVariableValue(value);
  return output;
}

export function projectVariableDefinitionsByCategory() {
  return PROJECT_VARIABLE_DEFINITIONS.reduce((groups, variable) => {
    const category = variable.category || 'Overig';
    groups[category] = groups[category] || [];
    groups[category].push(variable);
    return groups;
  }, {});
}

export function projectVariableValues(project = {}) {
  const dynamicValues = flattenScalarProjectValues(project || {}, 'project', {});
  const explicitValues = {};
  PROJECT_VARIABLE_DEFINITIONS.forEach(definition => {
    const path = definition.key.replace(/^project\./, '');
    explicitValues[definition.key] = formatVariableValue(getPathValue(project, path), definition);
  });
  return { ...dynamicValues, ...explicitValues };
}

export function replaceVariables(text, variables = [], project = null) {
  let output = String(text || '');
  const values = project ? projectVariableValues(project) : {};
  Object.entries(values).forEach(([key, value]) => {
    output = output.replaceAll(`{{${key}}}`, value);
  });
  variables.forEach(variable => {
    const key = variable && variable.key;
    if (!key) return;
    const fallback = variable.fallback || variable.label || key;
    output = output.replaceAll(`{{${key}}}`, fallback);
  });
  return output;
}

function paragraphsHtml(text, variables, project) {
  return replaceVariables(text, variables, project)
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p style="margin:0 0 14px;line-height:1.58;">${escapeHtml(part).replaceAll('\n', '<br>')}</p>`)
    .join('');
}

function checklistHtml(block, style, variables, project) {
  const intro = block.text ? paragraphsHtml(block.text, variables, project) : '';
  const items = (block.items || []).map(item => `
    <tr>
      <td width="26" valign="top" style="padding:6px 8px 6px 0;color:${style.accentColor};font-weight:700;">✓</td>
      <td valign="top" style="padding:6px 0;color:${style.textColor};line-height:1.48;">${escapeHtml(replaceVariables(item, variables, project))}</td>
    </tr>`).join('');
  return `${intro}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:4px;">${items}</table>`;
}

function cssClassHandle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'block';
}

function blockHtml(block, style, variables, project) {
  const blockClasses = `sp-mail-block sp-mail-block-${cssClassHandle(block.type)} sp-mail-block-${cssClassHandle(block.id)}`;
  if (block.type === 'spacer') return `<tr class="${blockClasses}" data-block-id="${escapeHtml(block.id)}"><td style="height:18px;font-size:18px;line-height:18px;">&nbsp;</td></tr>`;
  const body = block.type === 'checklist'
    ? checklistHtml(block, style, variables, project)
    : paragraphsHtml(block.text, variables, project);
  const title = block.title ? `<h2 class="sp-mail-block-title" style="margin:0 0 12px;font-size:18px;line-height:1.25;color:${style.textColor};">${escapeHtml(block.title)}</h2>` : '';
  const isCallout = block.type === 'callout';
  const boxStyle = isCallout
    ? `background:${style.backgroundColor};border-left:4px solid ${style.accentColor};border-radius:${Math.max(8, Number(style.borderRadius) - 6)}px;padding:18px 18px 4px;`
    : 'padding:18px 18px 4px 22px;';
  return `
    <tr class="${blockClasses}" data-block-id="${escapeHtml(block.id)}">
      <td style="padding:0 0 18px;">
        <div class="sp-mail-block-inner" style="${boxStyle}">
          ${title}
          <div class="sp-mail-block-content">${body}</div>
        </div>
      </td>
    </tr>`;
}

export function renderTemplateHtml(templateInput, project = null) {
  const template = normalizeTemplate(templateInput);
  const style = template.style;
  const customCss = style.customCss ? `<style>${style.customCss}</style>` : '';
  const blocks = template.blocks.map(block => blockHtml(block, style, template.variables, project)).join('');
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(template.subject)}</title>
  ${customCss}
</head>
<body style="margin:0;padding:0;background:${style.backgroundColor};font-family:${style.fontFamily};color:${style.textColor};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${style.backgroundColor};">
    <tr>
      <td align="center" style="padding:28px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:680px;background:${style.cardColor};border-radius:${style.borderRadius}px;overflow:hidden;box-shadow:0 18px 45px rgba(16,24,40,.10);">
          <tr>
            <td style="padding:24px 28px;background:${style.brandColor};color:#ffffff;">
              <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.86;">SmartPeak</div>
              <h1 style="margin:6px 0 0;font-size:24px;line-height:1.25;font-weight:700;">${escapeHtml(template.name)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;color:${style.textColor};font-size:15px;line-height:1.55;">
              ${blocks}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderTemplatePlainText(templateInput, project = null) {
  const template = normalizeTemplate(templateInput);
  return template.blocks.map(block => {
    const title = block.title ? `${block.title}\n` : '';
    const text = replaceVariables(block.text, template.variables, project);
    const items = block.items && block.items.length ? `\n${block.items.map(item => `- ${replaceVariables(item, template.variables, project)}`).join('\n')}` : '';
    return `${title}${text}${items}`.trim();
  }).filter(Boolean).join('\n\n');
}
