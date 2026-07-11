import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseIdeasResponse } from '../lib/llm/ideas.mjs';

describe('parseIdeasResponse', () => {
  it('parses the canonical JSON array shape', () => {
    const ideas = parseIdeasResponse(JSON.stringify([
      {
        title: 'Long energy hedges',
        type: 'LONG',
        ticker: 'XLE',
        confidence: 'HIGH',
        rationale: 'Brent and WTI are elevated while Hormuz risk is active.',
        risk: 'Diplomatic de-escalation',
        horizon: 'Weeks',
        signals: ['Brent high', 'Hormuz watch'],
      },
    ]));

    assert.equal(ideas.length, 1);
    assert.equal(ideas[0].type, 'LONG');
    assert.equal(ideas[0].confidence, 'HIGH');
  });

  it('parses Ollama-style object envelopes and alternate field names', () => {
    const ideas = parseIdeasResponse(`{
      "ideas": [
        {
          "recommendation": "Watch long-duration Treasuries",
          "direction": "underweight",
          "instrument": "TLT",
          "conviction": "medium",
          "thesis": "Yields remain elevated and energy pressure is persistent.",
          "keyRisk": "Growth shock",
          "timeHorizon": "Weeks",
          "evidence": "DGS10=4.33; WTI=112"
        }
      ]
    }`);

    assert.equal(ideas.length, 1);
    assert.equal(ideas[0].title, 'Watch long-duration Treasuries');
    assert.equal(ideas[0].type, 'SHORT');
    assert.equal(ideas[0].ticker, 'TLT');
    assert.deepEqual(ideas[0].signals, ['DGS10=4.33', 'WTI=112']);
  });

  it('accepts a single idea object when the model omits the array', () => {
    const ideas = parseIdeasResponse(`{
      "title": "Long Brent Crude via Middle East Escalation",
      "type": "LONG",
      "ticker": "BZ=F",
      "confidence": "HIGH",
      "rationale": "Brent faces upward pressure from heightened geopolitical risk.",
      "risk": "De-escalation",
      "horizon": "Weeks",
      "signals": ["Brent high", "GSCPI elevated"]
    }`);

    assert.equal(ideas.length, 1);
    assert.equal(ideas[0].ticker, 'BZ=F');
    assert.equal(ideas[0].source, 'llm');
  });

  it('parses snake_case trade_ideas envelopes from local models', () => {
    const ideas = parseIdeasResponse(`{
      "trade_ideas": [
        {
          "title": "Long Brent Crude on Hormuz Escalation",
          "type": "LONG",
          "ticker": "BZ=F",
          "confidence": "HIGH",
          "rationale": "Hormuz risk can pressure Brent higher.",
          "risk": "Diplomatic de-escalation",
          "horizon": "Days",
          "signals": ["Hormuz escalation", "Middle East air activity"]
        }
      ]
    }`);

    assert.equal(ideas.length, 1);
    assert.equal(ideas[0].title, 'Long Brent Crude on Hormuz Escalation');
    assert.equal(ideas[0].ticker, 'BZ=F');
  });
});
