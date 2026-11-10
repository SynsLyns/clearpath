import { ArrowRight, BadgeCheck, Sparkles } from "lucide-react";
import { chooseRole } from "./actions";
import { PageFooter } from "@/components/app-shell";

export default function Home() {
  return (
    <main className="landing">
      <div className="landing-glow landing-glow-one" />
      <div className="landing-glow landing-glow-two" />
      <div className="landing-content">
        <section className="role-picker" aria-labelledby="role-title">
          <div className="role-picker-heading">
            <p className="eyebrow">Demo workspace</p>
            <h2 id="role-title">Choose your point of view</h2>
            <p>Authentication is stubbed for this product demo.</p>
          </div>
          <div className="role-options">
            <form action={chooseRole}>
              <button className="role-option role-option-marketing" name="role" value="submitter">
                <span className="role-option-icon"><Sparkles size={21} /></span>
                <span className="role-option-copy">
                  <strong>I’m a submitter</strong>
                  <small>Jordan Lee · Marketing</small>
                  <small className="role-option-detail">Create a submission and track its progress</small>
                </span>
                <ArrowRight size={18} />
              </button>
            </form>
            <form action={chooseRole}>
              <button className="role-option role-option-review" name="role" value="reviewer">
                <span className="role-option-icon"><BadgeCheck size={21} /></span>
                <span className="role-option-copy">
                  <strong>I’m a reviewer</strong>
                  <small>Priya Nair · Compliance</small>
                  <small className="role-option-detail">Prioritize risk and record decisions</small>
                </span>
                <ArrowRight size={18} />
              </button>
            </form>
          </div>
          <div className="role-picker-foot">
            <span className="demo-dot" /> Demo data is illustrative
          </div>
        </section>
      </div>
      <PageFooter />
    </main>
  );
}
