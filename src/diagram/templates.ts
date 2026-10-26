// Ready-made diagrams to start from. Laid out on a 1920×1080 page, keeping the bottom-right
// corner free for the camera bubble. Steps are set so they can be recorded straight away.
import type { DiagramEdge, DiagramNode, NodeShape } from '../types';
import { DEFAULT_SIZE } from './geometry';
import { autoSteps } from './steps';
import { C, slotColor } from './theme';
import { sampleChart } from './charts';
import type { ChartSpec } from '../types';

export interface Template {
  id: string;
  title: string;
  blurb: string;
  build: () => { nodes: DiagramNode[]; edges: DiagramEdge[] };
}

let seq = 0;
const id = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

function node(shape: NodeShape, cx: number, cy: number, text: string, extra: Partial<DiagramNode> & { slot?: number } = {}): DiagramNode {
  const [dw, dh] = DEFAULT_SIZE[shape];
  const w = extra.w ?? dw, h = extra.h ?? dh;
  const { slot, ...rest } = extra;
  return { id: id(), shape, x: cx - w / 2, y: cy - h / 2, w, h, text, color: slotColor(slot ?? C.blue), ...rest };
}
const icon = (icon: string, cx: number, cy: number, text: string, extra: Partial<DiagramNode> & { slot?: number } = {}) =>
  node('icon', cx, cy, text, { icon, slot: C.blue, ...extra });
const frame = (x0: number, y0: number, x1: number, y1: number, text: string, slot: number = C.grey): DiagramNode => ({
  id: id(), shape: 'frame', x: x0, y: y0, w: x1 - x0, h: y1 - y0, text, color: slotColor(slot),
});
const title = (text: string, cx = 760, cy = 92) => node('text', cx, cy, text, { w: 900, h: 70, slot: C.grey });

const chart = (x: number, y: number, w: number, h: number, spec: ChartSpec, step: number): DiagramNode => ({
  id: id(), shape: 'chart', x, y, w, h, text: '', color: slotColor(C.blue), chart: spec, step, enter: 'reveal',
});

function edge(a: DiagramNode, b: DiagramNode, extra: Partial<DiagramEdge> = {}): DiagramEdge {
  return { id: id(), from: a.id, to: b.id, text: '', color: slotColor(C.grey), route: 'elbow', dashed: false, arrows: 'end', flow: false, ...extra };
}

export const TEMPLATES: Template[] = [
  {
    id: 'stock',
    title: 'Stock price story',
    blurb: 'A share price draws itself, then what moved it',
    build() {
      const line = chart(100, 170, 920, 540, { ...sampleChart('line'), title: 'ACME share price, 2025 (sample data)' }, 1);
      const dip = node('note', 1250, 300, 'June–July: weak forecast, shares fall 27%', { w: 320, h: 180, step: 2 });
      const up = node('note', 1250, 560, 'Autumn: new product launch, shares hit a record', { w: 320, h: 180, step: 3, slot: C.yellow });
      return { nodes: [title('What moved ACME stock this year?'), line, dip, up], edges: [] };
    },
  },
  {
    id: 'inflation',
    title: 'Inflation explained',
    blurb: 'A bar chart of inflation, then why prices rise',
    build() {
      const bars = chart(80, 170, 760, 500, sampleChart('bar'), 1);
      const money = icon('lu:Banknote', 1000, 300, 'More money chasing goods', { slot: C.green, step: 2 });
      const prices = icon('lu:TrendingUp', 1320, 300, 'Prices rise', { slot: C.red, step: 3 });
      const wallet = icon('lu:Wallet', 1320, 580, 'Each note buys less', { slot: C.orange, step: 4 });
      const nodes = [title('Why do prices keep rising?'), bars, money, prices, wallet];
      return { nodes, edges: [edge(money, prices, { packet: 'demand' }), edge(prices, wallet)] };
    },
  },
  {
    id: 'request',
    title: 'Request flow',
    blurb: 'What happens when a user places an order',
    build() {
      const user = icon('lu:User', 140, 300, 'User', { slot: C.purple });
      const web = icon('dev:react', 390, 300, 'Web app');
      const gw = node('rounded', 670, 300, 'API Gateway', { slot: C.purple });
      const orders = icon('dev:nodejs', 950, 300, 'Orders service');
      const mongo = icon('dev:mongodb', 1240, 300, 'MongoDB');
      const auth = icon('dev:spring', 670, 600, 'Auth service');
      const redis = icon('dev:redis', 950, 600, 'Sessions');
      const kafka = icon('dev:apachekafka', 1240, 600, 'Kafka');
      const mail = icon('lu:Mail', 1240, 870, 'Email service', { slot: C.orange });
      const nodes = [title('How an order is placed'), user, web, gw, orders, mongo, auth, redis, kafka, mail];
      const edges = [
        edge(user, web, { text: 'clicks Buy' }),
        edge(web, gw, { packet: 'POST /orders' }),
        edge(gw, auth, { packet: 'JWT' }),
        edge(auth, redis),
        edge(gw, orders),
        edge(orders, mongo, { text: 'save' }),
        edge(orders, kafka, { packet: 'OrderPlaced' }),
        edge(kafka, mail, { dashed: true }),
      ];
      return autoSteps(nodes, edges);
    },
  },
  {
    id: 'cicd',
    title: 'CI/CD pipeline',
    blurb: 'From git push to running in Kubernetes',
    build() {
      const build = frame(270, 205, 1420, 455, 'Build', C.blue);
      const ship = frame(390, 565, 1420, 840, 'Deploy', C.green);
      const dev = icon('lu:User', 140, 330, 'Developer', { slot: C.purple });
      const gh = icon('dev:github', 390, 330, 'GitHub');
      const jenkins = icon('dev:jenkins', 620, 330, 'Jenkins');
      const maven = icon('dev:maven', 850, 330, 'mvn package');
      const tests = icon('dev:junit', 1080, 330, 'Unit tests');
      const sonar = icon('dev:sonarqube', 1310, 330, 'Quality gate');
      const docker = icon('dev:docker', 1310, 690, 'Docker image');
      const registry = icon('lu:Package', 1040, 690, 'Registry', { slot: C.teal });
      const k8s = icon('dev:kubernetes', 770, 690, 'Kubernetes');
      const users = icon('lu:Users', 500, 690, 'Live!', { slot: C.green });
      const nodes = [title('CI/CD pipeline'), build, ship, dev, gh, jenkins, maven, tests, sonar, docker, registry, k8s, users];
      const edges = [
        edge(dev, gh, { text: 'git push' }),
        edge(gh, jenkins, { packet: 'webhook' }),
        edge(jenkins, maven),
        edge(maven, tests),
        edge(tests, sonar),
        edge(sonar, docker, { text: 'passed' }),
        edge(docker, registry, { packet: 'image:1.4' }),
        edge(registry, k8s),
        edge(k8s, users),
      ];
      return autoSteps(nodes, edges);
    },
  },
  {
    id: 'git',
    title: 'Git branching',
    blurb: 'Feature branches, release and merge to main',
    build() {
      const lanes = [
        frame(110, 170, 1450, 320, 'main', C.red),
        frame(110, 350, 1450, 500, 'develop', C.purple),
        frame(110, 530, 1450, 680, 'feature/login', C.green),
        frame(110, 710, 1450, 860, 'release/1.0', C.orange),
      ];
      const dot = (cx: number, cy: number, text: string, slot: number, step: number) => node('dot', cx, cy, text, { slot, step });
      const m1 = dot(330, 245, 'v0.9', C.red, 1);
      const d1 = dot(430, 425, '', C.purple, 2);
      const f1 = dot(560, 605, 'start', C.green, 3);
      const f2 = dot(700, 605, '', C.green, 3);
      const f3 = dot(840, 605, 'done', C.green, 3);
      const d2 = dot(960, 425, 'merged', C.purple, 4);
      const r1 = dot(1080, 785, '1.0-rc', C.orange, 5);
      const r2 = dot(1220, 785, 'fix', C.orange, 5);
      const m2 = dot(1360, 245, 'v1.0', C.red, 6);
      const d3 = dot(1360, 425, '', C.purple, 6);
      const line = (a: DiagramNode, b: DiagramNode, slot: number, extra: Partial<DiagramEdge> = {}) =>
        edge(a, b, { route: 'straight', arrows: 'none', color: slotColor(slot), ...extra });
      const curve = (a: DiagramNode, b: DiagramNode, slot: number, text = '') => edge(a, b, { route: 'curve', color: slotColor(slot), text });
      const nodes = [title('Git branching'), ...lanes, m1, d1, f1, f2, f3, d2, r1, r2, m2, d3];
      const edges = [
        curve(m1, d1, C.purple, 'branch'),
        curve(d1, f1, C.green),
        line(f1, f2, C.green),
        line(f2, f3, C.green),
        curve(f3, d2, C.purple, 'merge'),
        line(d1, d2, C.purple),
        curve(d2, r1, C.orange),
        line(r1, r2, C.orange),
        line(m1, m2, C.red, { dashed: true }),
        curve(r2, m2, C.red, 'release'),
        curve(r2, d3, C.purple),
        line(d2, d3, C.purple),
      ];
      return { nodes, edges };
    },
  },
  {
    id: 'micro',
    title: 'Microservices',
    blurb: 'Clients, gateway, services and their data',
    build() {
      const sections = [
        frame(90, 190, 390, 800, 'Clients', C.purple),
        frame(440, 190, 700, 800, 'Edge', C.teal),
        frame(750, 190, 1090, 800, 'Services', C.blue),
        frame(1140, 190, 1440, 800, 'Data', C.green),
      ];
      const web = icon('dev:react', 240, 360, 'Web app');
      const mobile = icon('lu:Smartphone', 240, 600, 'Mobile app', { slot: C.purple });
      const gw = icon('dev:nginx', 570, 480, 'API Gateway');
      const users = icon('dev:spring', 920, 310, 'Users');
      const orders = icon('dev:nodejs', 920, 500, 'Orders');
      const pay = icon('dev:go', 920, 690, 'Payments');
      const pg = icon('dev:postgresql', 1290, 310, 'PostgreSQL');
      const mongo = icon('dev:mongodb', 1290, 500, 'MongoDB');
      const redis = icon('dev:redis', 1290, 690, 'Redis');
      const nodes = [title('Microservices architecture'), ...sections, web, mobile, gw, users, orders, pay, pg, mongo, redis];
      const edges = [edge(web, gw), edge(mobile, gw), edge(gw, users), edge(gw, orders), edge(gw, pay), edge(users, pg), edge(orders, mongo), edge(pay, redis)];
      return autoSteps(nodes, edges);
    },
  },
  {
    id: 'org',
    title: 'Org chart',
    blurb: 'Who reports to whom, level by level',
    build() {
      const box = (cx: number, cy: number, text: string, slot: number) => node('rounded', cx, cy, text, { slot, w: 230, h: 96 });
      const ceo = box(800, 200, 'CEO', C.purple);
      const cto = box(400, 430, 'CTO', C.blue);
      const cfo = box(800, 430, 'CFO', C.blue);
      const coo = box(1200, 430, 'COO', C.blue);
      const eng = box(260, 680, 'Engineering', C.teal);
      const prod = box(560, 680, 'Product', C.teal);
      const fin = box(860, 680, 'Finance', C.teal);
      const ops = box(1160, 680, 'Operations', C.teal);
      const nodes = [ceo, cto, cfo, coo, eng, prod, fin, ops];
      const edges = [edge(ceo, cto), edge(ceo, cfo), edge(ceo, coo), edge(cto, eng), edge(cto, prod), edge(cfo, fin), edge(coo, ops)].map((e) => ({ ...e, arrows: 'none' as const }));
      return autoSteps(nodes, edges);
    },
  },
];
