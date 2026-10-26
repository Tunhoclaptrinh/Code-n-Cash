import type { ApprovalRole, Origin, Role } from "./types";

/**
 * Organisations come from parties.csv. People are not in the Data Pack, so each account is demo
 * seed data (origin SEED): a name, an email and a job title attached to a real party.
 */
/** The platform operator; it runs CodeCash and is never a party to a contract. */
export const INTERNAL_ORG = { id: "OPS", name: "CodeCash · Vận hành nền tảng" };

export interface AccountSpec {
  id: string;
  email: string;
  displayName: string;
  title: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  /** Party the account acts as: the approver party, the buyer or the supplier itself. */
  partyId: string | null;
  origin: Origin;
}

export interface OrganizationSpec {
  id: string;
  name: string;
  code: string;
  kind: "BUYER" | "SUPPLIER" | "INTERNAL";
  email: string;
  category: string;
  region: string;
  origin: Origin;
}

type Party = Record<string, string>;

const GENERIC = new Set(
  "jsc digital services service business technology solutions systems equipment commerce vietnam operations enterprise it infrastructure education data".split(
    " ",
  ),
);

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

/** "Phú Minh Technology JSC" → "phuminh.vn". */
function domainOf(name: string, taken: Set<string>, id: string): string {
  const words = plain(name).split(/\s+/);
  const kept: string[] = [];
  for (const word of words) {
    if (GENERIC.has(word.toLowerCase())) break;
    kept.push(word);
  }
  let domain = (kept.length ? kept : words.slice(0, 1))
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (taken.has(domain)) domain += id.toLowerCase();
  taken.add(domain);
  return `${domain}.vn`;
}

const FAMILY =
  "Nguyễn Trần Lê Phạm Hoàng Huỳnh Phan Vũ Võ Đặng Bùi Đỗ Hồ Ngô Dương Lý".split(
    " ",
  );
const MIDDLE = "Văn Thị Minh Quốc Thanh Hữu Ngọc Thu Đức Gia".split(" ");
const GIVEN =
  "An Bình Châu Dũng Giang Hà Hải Hạnh Hiếu Hùng Khánh Lan Linh Long Mai Nam Ngân Nhung Phong Phúc Quân Quỳnh Sơn Tâm Thảo Trang Trung Tú Vy Yến".split(
    " ",
  );

/** Names already used by the demo screens; the rest are generated deterministically. */
const FIXED: Record<string, { id: string; name: string; email?: string }> = {
  A028: { id: "u-owner", name: "Nguyễn Văn An", email: "owner@novaan.vn" },
  A029: { id: "u-finance", name: "Lê Quốc Dũng", email: "finance@novaan.vn" },
  A030: {
    id: "u-secondary",
    name: "Phạm Minh Đức",
    email: "secondary@novaan.vn",
  },
  "B010:legal": {
    id: "u-legal",
    name: "Trần Thị Mai",
    email: "legal@novaan.vn",
  },
  "B010:controller": {
    id: "u-novaan-controller",
    name: "Đỗ Minh Khoa",
    email: "controller@novaan.vn",
  },
  S015: { id: "u-supplier", name: "Vũ Thanh Hà", email: "supplier@phuminh.vn" },
  "S015:controller": {
    id: "u-phuminh-controller",
    name: "Lý Thu Trang",
    email: "controller@phuminh.vn",
  },
};

const ROLE_SLUG: Record<ApprovalRole, string> = {
  CONTRACT_OWNER: "owner",
  FINANCE_APPROVER: "finance",
  SECONDARY_APPROVER: "secondary",
};

const TITLE: Record<Role, string> = {
  CONTRACT_OWNER: "Giám đốc dự án",
  FINANCE_APPROVER: "Kế toán trưởng",
  SECONDARY_APPROVER: "Phó giám đốc",
  LEGAL_REVIEWER: "Chuyên viên pháp chế hợp đồng",
  SUPPLIER: "Đại diện nhà cung cấp",
  ADMIN_AUDITOR: "Kiểm soát viên nội bộ",
  SYSTEM_ADMIN: "Quản trị hệ thống",
  AUDITOR: "Chuyên viên kiểm tra toàn vẹn",
};

export function buildDirectory(parties: Party[]): {
  organizations: OrganizationSpec[];
  accounts: AccountSpec[];
} {
  const taken = new Set<string>();
  const used = new Set(Object.values(FIXED).map((fixed) => fixed.name));
  let counter = 0;
  const personName = () => {
    for (;;) {
      const i = counter++;
      const name = `${FAMILY[i % FAMILY.length]} ${MIDDLE[(i * 3) % MIDDLE.length]} ${GIVEN[(i * 7) % GIVEN.length]}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
  };
  const organizations: OrganizationSpec[] = [];
  const domains = new Map<string, string>();
  for (const party of parties.filter((p) => p.party_type !== "APPROVER")) {
    const domain = domainOf(party.party_name, taken, party.party_id);
    domains.set(party.party_id, domain);
    organizations.push({
      id: party.party_id,
      name: party.party_name,
      code: party.party_id,
      kind: party.party_type as "BUYER" | "SUPPLIER",
      email: `contact@${domain}`,
      category: party.organization_category,
      region: party.region,
      origin: "DATA_PACK",
    });
  }
  organizations.push({
    ...INTERNAL_ORG,
    code: INTERNAL_ORG.id,
    kind: "INTERNAL",
    email: "contact@codecash.vn",
    category: "INTERNAL_CONTROL",
    region: "HANOI",
    origin: "SEED",
  });
  const nameOf = (id: string) =>
    organizations.find((org) => org.id === id)?.name ?? id;

  const accounts: AccountSpec[] = [];
  for (const party of parties) {
    if (party.party_type === "APPROVER") {
      const role = party.approval_role as ApprovalRole;
      const buyer = party.parent_party_id;
      const fixed = FIXED[party.party_id];
      accounts.push({
        id: fixed?.id ?? `u-${party.party_id.toLowerCase()}`,
        email: fixed?.email ?? `${ROLE_SLUG[role]}@${domains.get(buyer)}`,
        displayName: fixed?.name ?? personName(),
        title: TITLE[role],
        role,
        organizationId: buyer,
        organizationName: nameOf(buyer),
        partyId: party.party_id,
        origin: "SEED",
      });
    } else if (party.party_type === "BUYER") {
      // The buyer's contract officer, and its internal controller, who checks the owner's
      // exception proposals on the buyer's own contracts and takes no business action (SoD-2).
      for (const [slug, role] of [
        ["legal", "LEGAL_REVIEWER"],
        ["controller", "ADMIN_AUDITOR"],
      ] as const) {
        const fixed = FIXED[`${party.party_id}:${slug}`];
        accounts.push({
          id: fixed?.id ?? `u-${party.party_id.toLowerCase()}-${slug}`,
          email: fixed?.email ?? `${slug}@${domains.get(party.party_id)}`,
          displayName: fixed?.name ?? personName(),
          title: TITLE[role],
          role,
          organizationId: party.party_id,
          organizationName: party.party_name,
          partyId: party.party_id,
          origin: "SEED",
        });
      }
    } else {
      const fixed = FIXED[party.party_id];
      accounts.push({
        id: fixed?.id ?? `u-${party.party_id.toLowerCase()}`,
        email: fixed?.email ?? `supplier@${domains.get(party.party_id)}`,
        displayName: fixed?.name ?? personName(),
        title: TITLE.SUPPLIER,
        role: "SUPPLIER",
        organizationId: party.party_id,
        organizationName: party.party_name,
        partyId: party.party_id,
        origin: "SEED",
      });
      // The supplier's own controller checks that the buyer pays what the contract says and
      // follows its terms; it reads the supplier's contracts and takes no business action.
      const controller = FIXED[`${party.party_id}:controller`];
      accounts.push({
        id: controller?.id ?? `u-${party.party_id.toLowerCase()}-controller`,
        email: controller?.email ?? `controller@${domains.get(party.party_id)}`,
        displayName: controller?.name ?? personName(),
        title: TITLE.ADMIN_AUDITOR,
        role: "ADMIN_AUDITOR",
        organizationId: party.party_id,
        organizationName: party.party_name,
        partyId: party.party_id,
        origin: "SEED",
      });
    }
  }
  // Platform operator: one administrator and one integrity checker. Neither is a party to, or
  // reads, any contract.
  for (const [id, email, name, role] of [
    ["u-sysadmin", "sysadmin@codecash.vn", "Trịnh Hoài Phương", "SYSTEM_ADMIN"],
    ["u-auditor", "auditor@codecash.vn", "Mai Xuân Lộc", "AUDITOR"],
  ] as const)
    accounts.push({
      id,
      email,
      displayName: name,
      title: TITLE[role],
      role,
      organizationId: INTERNAL_ORG.id,
      organizationName: INTERNAL_ORG.name,
      partyId: null,
      origin: "SEED",
    });
  return { organizations, accounts };
}

/** Accounts offered by the demo sign-in menu first: one buyer, its supplier and the internal team. */
export const FEATURED_ACCOUNTS = [
  "u-owner",
  "u-legal",
  "u-finance",
  "u-secondary",
  "u-novaan-controller",
  "u-supplier",
  "u-phuminh-controller",
  "u-sysadmin",
  "u-auditor",
];
