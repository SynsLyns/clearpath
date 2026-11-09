import Link from "next/link";
import { redirect } from "next/navigation";
import { PageContainer, PageFooter, PageHeading } from "@/components/app-shell";
import { CHANNELS, PRODUCTS, QA_SAMPLE_RATE, SEVERITY_WEIGHTS, SLA_HOURS, type Channel, type Product } from "@/lib/constants";
import { titleCase } from "@/lib/format";
import { RULES, RULE_VERSION, type Severity } from "@/lib/rules";
import { getSession } from "@/lib/session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function matchesSearch(rule: (typeof RULES)[number], query: string) {
  if (!query) return true;
  const searchable = [
    rule.id,
    rule.title,
    rule.description,
    rule.rationale,
    rule.fix,
    rule.authority,
    rule.examples?.bad,
    rule.examples?.good,
  ].join(" ").toLowerCase();
  return searchable.includes(query.toLowerCase());
}

function appliesTo(
  rule: (typeof RULES)[number],
  product: Product,
  channel: Channel,
) {
  const attachments = rule.id === "manual_review_required" ? [{ name: "attachment" }] : [];
  return rule.applies(product, channel, attachments);
}

function applicabilityLabels(rule: (typeof RULES)[number]) {
  const products = PRODUCTS.filter((product) =>
    CHANNELS.some((channel) => appliesTo(rule, product, channel)),
  );
  const channels = CHANNELS.filter((channel) =>
    PRODUCTS.some((product) => appliesTo(rule, product, channel)),
  );
  const allProducts = products.length === PRODUCTS.length;
  const allChannels = channels.length === CHANNELS.length;

  if (allProducts && allChannels) return ["All products", "All channels"];
  const labels = allProducts
    ? ["All products"]
    : products.map((product) => `${titleCase(product)} only`);
  labels.push(
    ...(allChannels
      ? ["All channels"]
      : channels.map((channel) => `${titleCase(channel)} channel only`)),
  );
  return labels;
}

export default async function RulesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await getSession())) redirect("/");
  const params = await searchParams;
  const query = firstValue(params.q)?.trim() ?? "";
  const productValue = firstValue(params.product) ?? "all";
  const channelValue = firstValue(params.channel) ?? "all";
  const severityValue = firstValue(params.severity) ?? "all";
  const selectedProduct = PRODUCTS.includes(productValue as Product) ? productValue : "all";
  const selectedChannel = CHANNELS.includes(channelValue as Channel) ? channelValue : "all";
  const selectedSeverity =
    severityValue === "high" || severityValue === "medium" ? severityValue : "all";

  const productsToCheck = selectedProduct === "all" ? PRODUCTS : [selectedProduct as Product];
  const channelsToCheck = selectedChannel === "all" ? CHANNELS : [selectedChannel as Channel];
  const filteredRules = RULES
    .filter((rule) =>
      productsToCheck.some((product) =>
        channelsToCheck.some((channel) => appliesTo(rule, product, channel)),
      ),
    )
    .filter((rule) => selectedSeverity === "all" || rule.severity === selectedSeverity)
    .filter((rule) => matchesSearch(rule, query))
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
      return RULES.indexOf(a) - RULES.indexOf(b);
    });

  return (
    <>
      <PageContainer>
        <PageHeading
          eyebrow={`Rule set ${RULE_VERSION}`}
          title="Compliance rules"
          description="These are the checks every creative runs through before review."
        />

        <section className="rules-scoring" aria-labelledby="scoring-title">
          <div>
            <p className="eyebrow">How scoring works</p>
            <h2 id="scoring-title">A clear path from self-check to review</h2>
          </div>
          <ul>
            <li>High flags add {SEVERITY_WEIGHTS.high} points; Medium flags add {SEVERITY_WEIGHTS.medium} point.</li>
            <li>No flags is eligible for auto-clear; {QA_SAMPLE_RATE * 100}% is randomly sampled for QA.</li>
            <li>Any flag sends the submission to a reviewer. Attachments always require manual review.</li>
            <li>The queue prioritizes submissions past the {SLA_HOURS}-hour SLA, then higher risk scores.</li>
          </ul>
        </section>

        <form className="rules-filter-form" action="/rules" method="get">
          <label className="field">
            <span>Search rules</span>
            <input name="q" defaultValue={query} placeholder="Search title, authority, or guidance" />
          </label>
          <label className="field">
            <span>Product</span>
            <select name="product" defaultValue={selectedProduct}>
              <option value="all">All products</option>
              {PRODUCTS.map((product) => <option value={product} key={product}>{titleCase(product)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Channel</span>
            <select name="channel" defaultValue={selectedChannel}>
              <option value="all">All channels</option>
              {CHANNELS.map((channel) => <option value={channel} key={channel}>{titleCase(channel)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Severity</span>
            <select name="severity" defaultValue={selectedSeverity}>
              <option value="all">All severities</option>
              {(["high", "medium"] as const satisfies readonly Severity[]).map((severity) => (
                <option value={severity} key={severity}>{titleCase(severity)}</option>
              ))}
            </select>
          </label>
          <button className="button button-primary">Filter rules</button>
          <Link className="button button-outline" href="/rules">Clear filters</Link>
        </form>

        <div className="rules-result-heading" aria-live="polite">
          <strong>{filteredRules.length} {filteredRules.length === 1 ? "rule" : "rules"}</strong>
          <span>High severity appears first</span>
        </div>

        {filteredRules.length ? (
          <div className="rules-list">
            {filteredRules.map((rule) => (
              <article className="rule-card" id={`rule-${rule.id}`} key={rule.id}>
                <div className="rule-card-header">
                  <div>
                    <h2>{rule.title}</h2>
                    <code>{rule.id}</code>
                  </div>
                  <span className={`severity-label severity-${rule.severity}`}>{titleCase(rule.severity)}</span>
                </div>
                {rule.authority && (
                  <span
                    className="rule-authority"
                    title={`Rule inspired by ${rule.authority}. Illustrative, not legal advice.`}
                  >
                    {rule.authority}
                  </span>
                )}
                <div className="rule-applies">
                  <strong>Applies to</strong>
                  {applicabilityLabels(rule).map((label) => <span key={label}>{label}</span>)}
                </div>
                <dl className="rule-explanation">
                  <div><dt>What it checks</dt><dd>{rule.description}</dd></div>
                  <div><dt>Why it matters</dt><dd>{rule.rationale}</dd></div>
                  <div><dt>How to fix</dt><dd>{rule.fix}</dd></div>
                </dl>
                {rule.examples && (
                  <div className="rule-example-block">
                    <p>
                      Example · {titleCase(rule.examples.context.product)} · {titleCase(rule.examples.context.channel)}
                    </p>
                    <div className="rule-example-grid">
                      <div className="rule-example-fails">
                        <strong>Fails</strong>
                        <span>{rule.examples.bad}</span>
                      </div>
                      <div className="rule-example-passes">
                        <strong>Passes</strong>
                        <span>{rule.examples.good}</span>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="rules-empty" role="status">No rules match these filters.</div>
        )}
      </PageContainer>
      <PageFooter />
    </>
  );
}
