import { useState, useEffect, useMemo } from "react";
import {
  loadCharacters,
  saveCharacterToRoom,
  broadcastRoll,
} from "../lib/obr.js";
import {
  createBlankCharacter,
  deriveSecondary,
  deriveResources,
} from "../lib/character.js";
import { rollLigeia } from "../lib/dice.js";
import {
  RACES,
  HERITAGES,
  VOCATIONS,
  NATIONS,
  CAREERS,
} from "../data/character.js";
import { ARCANE_WORDS, WORDS_OF_BASE } from "../data/magicWords.js";
import { DiceTray } from "./Die3D.jsx";

export function CharacterSheet({ characterId }) {
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rollToast, setRollToast] = useState(null);

  // Carrega o personagem
  useEffect(() => {
    if (!characterId) {
      setCharacter(createBlankCharacter("Personagem"));
      setLoading(false);
      return;
    }
    loadCharacters().then((all) => {
      const c = all[characterId];
      setCharacter(c || createBlankCharacter("Personagem"));
      setLoading(false);
    });
  }, [characterId]);

  // Salvamento automático (debounced)
  useEffect(() => {
    if (!character || loading) return;
    const t = setTimeout(() => {
      saveCharacterToRoom(character);
    }, 400);
    return () => clearTimeout(t);
  }, [character, loading]);

  // Auto-dismiss do toast de rolagem
  useEffect(() => {
    if (!rollToast) return;
    const t = setTimeout(() => setRollToast(null), 4500);
    return () => clearTimeout(t);
  }, [rollToast]);

  const update = (patch) => setCharacter((c) => ({ ...c, ...patch }));
  const updateAttr = (key, patch) =>
    setCharacter((c) => ({
      ...c,
      attributes: {
        ...c.attributes,
        [key]: { ...c.attributes[key], ...patch },
      },
    }));

  // Função de rolagem reutilizável
  const rollWith = (label, attributeValue, diceCount, extraBonus = 0) => {
    const r = rollLigeia({
      label,
      attribute: attributeValue,
      improvement: diceCount,
      bonus: extraBonus,
    });
    setRollToast(r);
    broadcastRoll(r, character?.name || "—");
  };

  const secondary = useMemo(
    () => (character ? deriveSecondary(character) : null),
    [character],
  );
  const resources = useMemo(
    () => (character ? deriveResources(character) : { hpMax: 0, mpMax: 0 }),
    [character],
  );

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }} className="muted">
        Carregando ficha…
      </div>
    );
  }

  if (!character) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }} className="muted">
        Personagem não encontrado.
      </div>
    );
  }

  return (
    <div className="sheet">
      {/* Toast de rolagem */}
      {rollToast && (
        <div
          className={
            "roll-toast " +
            (rollToast.isCritSuccess
              ? "crit-success"
              : rollToast.isCritFail
              ? "crit-fail"
              : "")
          }
        >
          <div className="tiny muted">{rollToast.label}</div>
          <div
            className="roll-total"
            style={{
              color: rollToast.isCritSuccess
                ? "var(--crit-success)"
                : rollToast.isCritFail
                ? "var(--crit-fail)"
                : "var(--gold)",
            }}
          >
            {rollToast.total}
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <DiceTray result={rollToast} size={38} />
          </div>
          <div className="tiny muted text-center">
            [{rollToast.kept.join(" + ")}]
            {rollToast.attribute ? ` + ${rollToast.attribute} atr.` : ""}
          </div>
          {rollToast.isCritSuccess && (
            <div
              className="text-center"
              style={{
                color: "var(--crit-success)",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                marginTop: "0.3rem",
              }}
            >
              ✦ SUCESSO CRÍTICO ✦
            </div>
          )}
          {rollToast.isCritFail && (
            <div
              className="text-center"
              style={{
                color: "var(--crit-fail)",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                marginTop: "0.3rem",
              }}
            >
              ✗ FALHA CRÍTICA ✗
            </div>
          )}
        </div>
      )}

      {/* Cabeçalho com logo */}
      <header className="sheet-header">
        <div className="brand-block">
          <div className="brand-mark">LIGEIA</div>
          <div className="brand-sub">RPG</div>
        </div>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            value={character.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Nome do personagem"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.4rem",
              color: "var(--gold)",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--border-strong)",
              borderRadius: 0,
              padding: "0.2rem 0",
            }}
          />
          <input
            type="text"
            value={character.concept}
            onChange={(e) => update({ concept: e.target.value })}
            placeholder="Conceito (ex: lâmina solitária do norte)"
            className="tiny muted"
            style={{
              background: "transparent",
              border: "none",
              padding: "0.2rem 0",
              marginTop: "0.25rem",
            }}
          />
        </div>
        <div className="sheet-toolbar">
          <button onClick={() => saveCharacterToRoom(character)}>Salvar</button>
        </div>
      </header>

      {/* Linha de identidade: raça, herança, vocação, modelo, carreiras */}
      <div className="identity-row">
        <div>
          <label>Raça</label>
          <select value={character.race} onChange={(e) => update({ race: e.target.value })}>
            <option value="">—</option>
            {RACES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Herança</label>
          <select value={character.heritage} onChange={(e) => update({ heritage: e.target.value })}>
            {HERITAGES.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Vocação</label>
          <select value={character.vocation} onChange={(e) => update({ vocation: e.target.value })}>
            <option value="">—</option>
            {VOCATIONS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Modelo</label>
          <input
            type="text"
            value={character.template}
            onChange={(e) => update({ template: e.target.value })}
            placeholder="Ex: Atemporal"
          />
        </div>
        <div>
          <label>Carreiras</label>
          <input
            type="text"
            value={character.careers}
            onChange={(e) => update({ careers: e.target.value })}
            placeholder="—"
          />
        </div>
      </div>

      {/* Nível / XP / Corrupção / Personalidade */}
      <div className="identity-row">
        <div>
          <label>Nível</label>
          <input
            type="number"
            min="1"
            value={character.level}
            onChange={(e) => update({ level: Number(e.target.value) })}
          />
        </div>
        <div>
          <label>XP Gasto</label>
          <input
            type="number"
            min="0"
            value={character.xpSpent}
            onChange={(e) => update({ xpSpent: Number(e.target.value) })}
          />
        </div>
        <div>
          <label>XP Restante</label>
          <input
            type="number"
            min="0"
            value={character.xpRemaining}
            onChange={(e) => update({ xpRemaining: Number(e.target.value) })}
          />
        </div>
        <div>
          <label>Corrupção</label>
          <input
            type="number"
            min="0"
            max="10"
            value={character.corruption}
            onChange={(e) => update({ corruption: Number(e.target.value) })}
          />
        </div>
        <div>
          <label>Pontos Heroicos</label>
          <input
            type="number"
            min="0"
            value={character.heroicPoints}
            onChange={(e) => update({ heroicPoints: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="info-bar">
        Clique em qualquer círculo de atributo para rolar 2d6 + atributo +
        dados de melhoria. Os resultados são compartilhados na sala.
      </div>

      {/* Grade principal: atributos | habilidades */}
      <div className="sheet-main">
        {/* Coluna esquerda: atributos */}
        <div className="col gap-2">
          <AttributeBlock
            label="FORÇA"
            attr={character.attributes.forca}
            onChange={(p) => updateAttr("forca", p)}
            onRoll={() =>
              rollWith("Força", character.attributes.forca.value, character.attributes.forca.dice)
            }
            derived={[
              { label: "Bloqueio", value: secondary.bloqueio.value, onRoll: () => rollWith("Bloqueio", secondary.bloqueio.value, secondary.bloqueio.dice) },
              { label: "Carga", value: `${secondary.carga.value} kg`, onRoll: null },
            ]}
          />

          <AttributeBlock
            label="AGILIDADE"
            attr={character.attributes.agilidade}
            onChange={(p) => updateAttr("agilidade", p)}
            onRoll={() =>
              rollWith(
                "Agilidade",
                character.attributes.agilidade.value,
                character.attributes.agilidade.dice,
              )
            }
            derived={[
              { label: "Esquiva", value: secondary.esquiva.value, onRoll: () => rollWith("Esquiva", secondary.esquiva.value, secondary.esquiva.dice) },
              { label: "Deslocamento", value: `${secondary.deslocamento.value} m`, onRoll: null },
            ]}
          />

          <AttributeBlock
            label="VIGOR"
            attr={character.attributes.vigor}
            onChange={(p) => updateAttr("vigor", p)}
            onRoll={() =>
              rollWith("Vigor", character.attributes.vigor.value, character.attributes.vigor.dice)
            }
            derived={[
              {
                label: "Pontos de Vida",
                value: (
                  <ResourceInput
                    current={character.hp.current}
                    max={resources.hpMax}
                    onChange={(v) =>
                      update({ hp: { ...character.hp, current: v } })
                    }
                  />
                ),
                onRoll: null,
                full: true,
              },
              { label: "Sono, Fome e Sede", value: secondary.sonoFomeSed.value, onRoll: () => rollWith("Vigor (sono/fome/sede)", secondary.sonoFomeSed.value, character.attributes.vigor.dice) },
            ]}
          />

          <AttributeBlock
            label="MENTE"
            attr={character.attributes.mente}
            onChange={(p) => updateAttr("mente", p)}
            onRoll={() =>
              rollWith("Mente", character.attributes.mente.value, character.attributes.mente.dice)
            }
            derived={[
              {
                label: "Pontos de Magia",
                value: (
                  <ResourceInput
                    current={character.mp.current}
                    max={resources.mpMax}
                    onChange={(v) =>
                      update({ mp: { ...character.mp, current: v } })
                    }
                  />
                ),
                onRoll: null,
                full: true,
              },
              { label: "Conjuração", value: secondary.conjuracao.value, onRoll: () => rollWith("Conjuração", secondary.conjuracao.value, secondary.conjuracao.dice) },
            ]}
          />

          <AttributeBlock
            label="PERCEPÇÃO"
            attr={character.attributes.percepcao}
            onChange={(p) => updateAttr("percepcao", p)}
            onRoll={() =>
              rollWith(
                "Percepção",
                character.attributes.percepcao.value,
                character.attributes.percepcao.dice,
              )
            }
            derived={[
              { label: "Iniciativa", value: secondary.iniciativa.value, onRoll: () => rollWith("Iniciativa", secondary.iniciativa.value, secondary.iniciativa.dice) },
              { label: "Percepção Passiva", value: secondary.percepcaoPassiva.value, onRoll: null },
            ]}
          />

          {/* Ataques */}
          <h3 style={{ marginTop: "0.5rem" }}>Ataques</h3>
          {character.attacks.map((atk, i) => (
            <AttackBlock
              key={i}
              attack={atk}
              attributes={character.attributes}
              onChange={(patch) => {
                const newAttacks = [...character.attacks];
                newAttacks[i] = { ...newAttacks[i], ...patch };
                update({ attacks: newAttacks });
              }}
              onRoll={() => {
                const atVal = character.attributes[atk.attribute]?.value || 0;
                const atDice = character.attributes[atk.attribute]?.dice || 0;
                rollWith(
                  `Ataque: ${atk.weapon || "—"}`,
                  atVal,
                  atDice + (Number(atk.dice) || 0),
                  Number(atk.bonus) || 0,
                );
              }}
            />
          ))}
        </div>

        {/* Coluna direita: habilidades + equipamentos */}
        <div className="col gap-2">
          <SkillsPanel
            skills={character.skills}
            attributes={character.attributes}
            onChange={(skills) => update({ skills })}
            onRoll={(skill) => {
              // Para rolar uma habilidade, somamos 1 dado de melhoria para
              // o nível B e 2 para o A (regra geral; o jogador pode ajustar).
              const dice = skill.level === "A" ? 2 : skill.level === "B" ? 1 : 0;
              const attrKey = skill.attribute || "mente";
              rollWith(
                skill.name,
                character.attributes[attrKey]?.value || 0,
                (character.attributes[attrKey]?.dice || 0) + dice,
              );
            }}
          />

          <div className="panel">
            <div className="panel-title">Equipamentos</div>
            <textarea
              value={character.equipment}
              onChange={(e) => update({ equipment: e.target.value })}
              placeholder="Lista de equipamentos, itens carregados..."
              rows={8}
              style={{ resize: "vertical" }}
            />
          </div>

          <div className="panel">
            <div className="panel-title">Personalidade & Notas</div>
            <textarea
              value={character.personality}
              onChange={(e) => update({ personality: e.target.value })}
              placeholder="Personalidade, traços, ideais, vínculos, defeitos..."
              rows={3}
            />
            <textarea
              value={character.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Notas livres, história, anotações de campanha..."
              rows={4}
              style={{ marginTop: "0.5rem" }}
            />
          </div>
        </div>
      </div>

      {/* Magia */}
      <MagicSection character={character} onChange={update} onRoll={rollWith} />
    </div>
  );
}

/* =========================================================================
   Sub-componentes
   ========================================================================= */

function AttributeBlock({ label, attr, onChange, onRoll, derived }) {
  return (
    <div className="attribute-block">
      <div className="attribute-circle" onClick={onRoll} title="Clique para rolar">
        <div className="attr-name">{label}</div>
        <input
          type="number"
          value={attr.value}
          onChange={(e) => onChange({ value: Number(e.target.value) })}
          min="0"
          max="10"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--gold)",
            fontFamily: "var(--font-display)",
            fontSize: "2.1rem",
            fontWeight: 700,
            width: "60px",
            padding: 0,
            textAlign: "center",
          }}
        />
        <div className="attr-dice">
          <span className="tiny muted">Dados </span>
          <input
            type="number"
            value={attr.dice}
            onChange={(e) => onChange({ dice: Number(e.target.value) })}
            min="0"
            max="10"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--gold)",
              fontFamily: "var(--font-display)",
              fontSize: "0.7rem",
              width: "20px",
              padding: 0,
            }}
          />
        </div>
      </div>
      <div className="attribute-derived">
        {derived.map((d, i) => (
          <div
            key={i}
            className="derived-pill"
            onClick={d.onRoll}
            style={{ cursor: d.onRoll ? "pointer" : "default" }}
            title={d.onRoll ? "Clique para rolar" : ""}
          >
            <label>{d.label}</label>
            <div className="derived-value">
              {d.full ? d.value : <span>{d.value}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourceInput({ current, max, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
      <input
        type="number"
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: 50,
          textAlign: "center",
          padding: "0.2rem",
          fontSize: "0.95rem",
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <span style={{ color: "var(--text-muted)" }}>/</span>
      <span style={{ color: "var(--gold)", fontFamily: "var(--font-display)" }}>
        {max}
      </span>
    </div>
  );
}

function AttackBlock({ attack, attributes, onChange, onRoll }) {
  const attrKey = attack.attribute || "forca";
  const baseAttr = attributes[attrKey]?.value || 0;
  const baseDice = attributes[attrKey]?.dice || 0;
  const totalBonus = baseAttr + (Number(attack.bonus) || 0);
  const totalDice = baseDice + (Number(attack.dice) || 0);

  return (
    <div className="attack-block">
      <div className="attack-bonus-circle" onClick={onRoll} title="Clique para rolar ataque">
        <div className="attr-name">Bônus</div>
        <div className="attr-value">{totalBonus}</div>
        <div className="tiny" style={{ color: "var(--rubi-bright)" }}>
          {totalDice > 0 ? `+${totalDice}D` : ""}
        </div>
      </div>
      <div className="attack-details">
        <input
          type="text"
          value={attack.weapon}
          onChange={(e) => onChange({ weapon: e.target.value })}
          placeholder="Arma"
        />
        <div className="row gap-2">
          <select
            value={attack.attribute}
            onChange={(e) => onChange({ attribute: e.target.value })}
            style={{ flex: 1 }}
          >
            <option value="forca">Força</option>
            <option value="agilidade">Agilidade</option>
            <option value="mente">Mente (Conjuração)</option>
          </select>
          <input
            type="number"
            value={attack.bonus}
            onChange={(e) => onChange({ bonus: Number(e.target.value) })}
            placeholder="Bônus"
            style={{ width: 60 }}
            title="Bônus de habilidade (+1 de Usar Armas, etc)"
          />
          <input
            type="number"
            value={attack.dice}
            onChange={(e) => onChange({ dice: Number(e.target.value) })}
            placeholder="Dados"
            style={{ width: 60 }}
            title="Dados de melhoria adicionais"
          />
        </div>
        <input
          type="text"
          value={attack.properties}
          onChange={(e) => onChange({ properties: e.target.value })}
          placeholder="Propriedades (dano, alcance, etc.)"
        />
      </div>
    </div>
  );
}

function SkillsPanel({ skills, attributes, onChange, onRoll }) {
  const addSkill = () => {
    onChange([
      ...skills,
      { name: "", level: null, attribute: "mente" },
    ]);
  };

  const updateSkill = (i, patch) => {
    const copy = [...skills];
    copy[i] = { ...copy[i], ...patch };
    onChange(copy);
  };

  const removeSkill = (i) => {
    onChange(skills.filter((_, idx) => idx !== i));
  };

  const setLevel = (i, lvl) => {
    const skill = skills[i];
    // Clicar no mesmo nível desativa
    updateSkill(i, { level: skill.level === lvl ? null : lvl });
  };

  return (
    <div className="panel">
      <div className="panel-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Habilidades</span>
        <button onClick={addSkill} style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}>
          + Adicionar
        </button>
      </div>

      <div className="skill-header">
        <span>Nome</span>
        <span>B</span>
        <span>A</span>
        <span>E</span>
        <span></span>
      </div>

      <div className="skills-list">
        {skills.length === 0 && (
          <div className="muted tiny" style={{ padding: "1rem 0", textAlign: "center" }}>
            Nenhuma habilidade ainda. Clique em "+ Adicionar" para começar.
          </div>
        )}
        {skills.map((s, i) => (
          <div key={i} className="skill-row">
            <input
              type="text"
              value={s.name}
              onChange={(e) => updateSkill(i, { name: e.target.value })}
              placeholder="Nome da habilidade"
              onClick={(e) => {
                if (s.name && e.detail === 2) onRoll(s);
              }}
              title="Clique duplo no nome para rolar"
            />
            <button
              className={"skill-checkbox " + (s.level === "B" ? "active" : "")}
              onClick={() => setLevel(i, "B")}
              title="Básico"
            >
              {s.level === "B" ? "●" : ""}
            </button>
            <button
              className={"skill-checkbox " + (s.level === "A" ? "active" : "")}
              onClick={() => setLevel(i, "A")}
              title="Avançado"
            >
              {s.level === "A" ? "●" : ""}
            </button>
            <button
              className={"skill-checkbox " + (s.level === "E" ? "active" : "")}
              onClick={() => setLevel(i, "E")}
              title="Especial"
            >
              {s.level === "E" ? "●" : ""}
            </button>
            <button
              className="danger"
              onClick={() => removeSkill(i)}
              style={{ padding: "0.25rem 0.4rem", fontSize: "0.7rem" }}
              title="Remover"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MagicSection({ character, onChange, onRoll }) {
  const known = new Set(character.magic.knownWords);

  const toggleWord = (id) => {
    const next = new Set(known);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({
      magic: { ...character.magic, knownWords: Array.from(next) },
    });
  };

  const updateGrimoire = (i, patch) => {
    const grimoire = [...character.magic.grimoire];
    grimoire[i] = { ...grimoire[i], ...patch };
    onChange({ magic: { ...character.magic, grimoire } });
  };

  const updateMetamagic = (i, j, value) => {
    const grimoire = [...character.magic.grimoire];
    const metamagics = [...grimoire[i].metamagics];
    metamagics[j] = value;
    grimoire[i] = { ...grimoire[i], metamagics };
    onChange({ magic: { ...character.magic, grimoire } });
  };

  return (
    <div className="magic-grid">
      {/* Palavras Arcanas */}
      <div className="panel">
        <div className="panel-title">Palavras Arcanas</div>
        <p className="tiny muted" style={{ marginBottom: "0.5rem" }}>
          Clique nas palavras que seu personagem aprendeu.
        </p>

        <h4 style={{ marginTop: "0.4rem", marginBottom: "0.3rem" }}>Abstratas</h4>
        <div className="words-grid">
          {WORDS_OF_BASE.map((w) => (
            <div
              key={w.id}
              className={"word-chip " + (known.has(w.id) ? "known" : "")}
              onClick={() => toggleWord(w.id)}
            >
              <div className="word-chip-mark">{known.has(w.id) ? "✓" : ""}</div>
              <span>{w.name}</span>
            </div>
          ))}
        </div>

        <h4 style={{ marginTop: "0.8rem", marginBottom: "0.3rem" }}>Palavras Arcanas</h4>
        <div className="words-grid">
          {ARCANE_WORDS.map((w) => (
            <div
              key={w.id}
              className={"word-chip " + (known.has(w.id) ? "known" : "")}
              onClick={() => toggleWord(w.id)}
              title={w.damage ? `Dano: ${w.damage}` : w.category}
            >
              <div className="word-chip-mark">{known.has(w.id) ? "✓" : ""}</div>
              <span>{w.name}</span>
            </div>
          ))}
        </div>

        <h4 style={{ marginTop: "0.8rem", marginBottom: "0.3rem" }}>Magias Menores / Truques</h4>
        <textarea
          value={character.magic.minorSpells}
          onChange={(e) =>
            onChange({
              magic: { ...character.magic, minorSpells: e.target.value },
            })
          }
          placeholder="Liste as magias menores e truques conhecidos..."
          rows={6}
        />
      </div>

      {/* Grimório */}
      <div className="panel">
        <div className="panel-title">Grimório</div>
        <p className="tiny muted" style={{ marginBottom: "0.5rem" }}>
          Até 6 magias base, cada uma com até 2 metamagias.
        </p>
        {character.magic.grimoire.map((entry, i) => (
          <div key={i} className="grimoire-entry">
            <div className="base-spell">Magia Base {i + 1}</div>
            <input
              type="text"
              value={entry.base}
              onChange={(e) => updateGrimoire(i, { base: e.target.value })}
              placeholder="Nome da magia base..."
            />
            <div className="metamagic">
              <label>Metamagia 1</label>
              <input
                type="text"
                value={entry.metamagics[0]}
                onChange={(e) => updateMetamagic(i, 0, e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="metamagic">
              <label>Metamagia 2</label>
              <input
                type="text"
                value={entry.metamagics[1]}
                onChange={(e) => updateMetamagic(i, 1, e.target.value)}
                placeholder="—"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
