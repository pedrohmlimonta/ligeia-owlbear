import { useState, useEffect, useMemo, createContext, useContext } from "react";
import {
  loadCharacters,
  saveCharacterToRoom,
  broadcastRoll,
  onRoleChange,
  getSelectedItemIds,
  linkCharacterToItem,
  unlinkItem,
  getItemById,
  updateTokenBars,
  removeTokenBars,
  getMyPlayerId,
  onPartyChange,
} from "../lib/obr.js";
import {
  createBlankCharacter,
  deriveSecondary,
  deriveResources,
  migrateCharacter,
  clampResources,
} from "../lib/character.js";
import { rollLigeia } from "../lib/dice.js";
import {
  collectActiveEffects,
  getRollModifiers,
  getStatModifiers,
  getStatOverride,
  summarizeEffects,
  isItemActive,
  isEffectEnabled,
  EFFECT_ROLL_TARGETS,
  EFFECT_STAT_TARGETS,
  EFFECT_SET_TARGETS,
  EFFECT_TYPES,
} from "../lib/effects.js";
import {
  downloadCharacterJson,
  parseImportedJson,
  readFileAsText,
} from "../lib/importExport.js";
import { openPrintableSheet } from "../lib/pdfExport.js";
import {
  RACES,
  HERITAGES,
  VOCATIONS,
  NATIONS,
  CAREERS,
} from "../data/character.js";
import { ARCANE_WORDS } from "../data/magicWords.js";
import { DiceTray } from "./Die3D.jsx";

// Context para propagar permissão de edição estrutural (somente GM).
// Jogadores ainda podem alterar toggles (active/enabled) - estes não
// dependem do contexto, são sempre clicáveis.
const EditPermContext = createContext(true);

export function CharacterSheet({ characterId }) {
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rollToast, setRollToast] = useState(null);
  const [role, setRole] = useState("GM");
  const [tokenName, setTokenName] = useState(null);
  const [myId, setMyId] = useState(null);
  const [party, setParty] = useState([]);

  useEffect(() => {
    return onRoleChange(setRole);
  }, []);

  useEffect(() => {
    getMyPlayerId().then(setMyId);
  }, []);

  useEffect(() => {
    return onPartyChange(setParty);
  }, []);

  const isGM = role === "GM";
  // O dono da ficha ganha permissões de GM se o Narrador ativar o toggle
  // grantPlayerGmAccess.
  const isOwnerWithAccess =
    !isGM &&
    character?.playerId &&
    character.playerId === myId &&
    !!character?.grantPlayerGmAccess;
  const canEdit = isGM || isOwnerWithAccess;

  // Carrega o personagem
  useEffect(() => {
    if (!characterId) {
      setCharacter(createBlankCharacter("Personagem"));
      setLoading(false);
      return;
    }
    loadCharacters().then((all) => {
      const c = all[characterId];
      setCharacter(c ? migrateCharacter(c) : createBlankCharacter("Personagem"));
      setLoading(false);
    });
  }, [characterId]);

  // Carrega o nome do(s) token(s) vinculado(s) — mostra o primeiro
  useEffect(() => {
    const ids = character?.tokenIds || [];
    if (ids.length === 0) {
      setTokenName(null);
      return;
    }
    getItemById(ids[0]).then((item) => {
      const baseName = item?.name || item?.text?.plainText || "Token";
      setTokenName(
        ids.length > 1 ? `${baseName} + ${ids.length - 1} outro(s)` : baseName,
      );
    });
  }, [character?.tokenIds]);

  // Salvamento automático (debounced)
  useEffect(() => {
    if (!character || loading) return;
    const t = setTimeout(() => {
      const eff = collectActiveEffects(character);
      const res = deriveResources(character, eff);
      // Aplica clamp antes de salvar: PV/PM/PH atuais não passam do máximo,
      // PV temp não fica negativo
      const clamped = clampResources(character, res);
      // Se o clamp alterou algo, atualiza o estado local também
      if (
        clamped.hp.current !== character.hp.current ||
        clamped.hp.temp !== character.hp.temp ||
        clamped.mp.current !== character.mp.current ||
        clamped.heroicPoints !== character.heroicPoints
      ) {
        setCharacter(clamped);
        return; // novo render reagenda esse effect, evita salvar valor não-clampado
      }
      saveCharacterToRoom(clamped);
      // Atualiza barras em TODOS os tokens vinculados, se houver
      const ids = clamped.tokenIds || [];
      if (ids.length > 0) {
        const stats = {
          hp: {
            current: clamped.hp.current,
            max: res.hpMax,
            temp: clamped.hp.temp || 0,
          },
          mp: { current: clamped.mp.current, max: res.mpMax },
          hero: { current: clamped.heroicPoints, max: res.heroicMax },
        };
        for (const tid of ids) {
          updateTokenBars(tid, clamped.id, stats, !!clamped.npc);
        }
      }
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
  // Efeitos ativos no momento (recalculados a cada render)
  const activeEffects = useMemo(
    () => (character ? collectActiveEffects(character) : []),
    [character],
  );
  const effectSummary = useMemo(
    () => summarizeEffects(activeEffects),
    [activeEffects],
  );

  /**
   * Faz uma rolagem. ctx descreve a natureza (atributo, ataque, habilidade)
   * para que os efeitos ativos sejam aplicados automaticamente.
   */
  const rollWith = (label, attributeValue, diceCount, extraBonus = 0, ctx = {}) => {
    const mods = getRollModifiers(activeEffects, ctx);
    // Se houver efeito SET sobre este atributo primário, ele sobrescreve o valor base
    let effectiveAttr = attributeValue;
    if (ctx.attribute) {
      const ovr = getStatOverride(activeEffects, ctx.attribute);
      if (ovr) {
        effectiveAttr = ovr.value;
        mods.sources.push({
          source: ovr.source,
          type: "set",
          value: ovr.value,
          label: `define ${ctx.attribute} = ${ovr.value}`,
        });
      }
    }
    const totalDice = (diceCount || 0) + mods.dice;
    const totalBonus = (extraBonus || 0) + mods.bonus;
    const r = rollLigeia({
      label,
      attribute: effectiveAttr,
      improvement: totalDice,
      bonus: totalBonus,
    });
    if (mods.sources.length) {
      r.appliedModifiers = mods.sources;
    }
    setRollToast(r);
    broadcastRoll(r, character?.name || "—", {
      hidden: !!character?.rollHidden,
    });
  };

  const secondary = useMemo(
    () => (character ? deriveSecondary(character, activeEffects) : null),
    [character, activeEffects],
  );
  const resources = useMemo(
    () =>
      character
        ? deriveResources(character, activeEffects)
        : { hpMax: 0, mpMax: 0, heroicMax: 0 },
    [character, activeEffects],
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

  // Jogadores não podem abrir fichas de NPC
  if (character.npc && !isGM) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }} className="muted">
        <div style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>🔒</div>
        <div>Esta ficha é privada do Narrador.</div>
      </div>
    );
  }

  // Jogadores só podem abrir a própria ficha (atribuída a eles).
  // Fichas sem dono permanecem bloqueadas — só o Narrador pode atribuir.
  if (!isGM && character.playerId !== myId) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }} className="muted">
        <div style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>🔒</div>
        <div>
          {character.playerId
            ? "Esta ficha pertence a outro jogador."
            : "Esta ficha ainda não foi atribuída a você."}
        </div>
      </div>
    );
  }

  return (
    <EditPermContext.Provider value={canEdit}>
    <div className={"sheet " + (canEdit ? "" : "sheet-readonly")}>
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
          {rollToast.appliedModifiers && rollToast.appliedModifiers.length > 0 && (
            <div className="toast-mods">
              <div className="tiny" style={{ color: "var(--gold-soft)", textAlign: "center", marginBottom: "0.2rem" }}>
                Modificadores aplicados:
              </div>
              {rollToast.appliedModifiers.map((m, i) => (
                <div key={i} className="tiny muted" style={{ textAlign: "center" }}>
                  {m.type === "dice" ? `+${m.value}D` : `${m.value >= 0 ? "+" : ""}${m.value}`} — {m.source}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cabeçalho com logo */}
      <header className="sheet-header">
        <PortraitInput
          value={character.image}
          onChange={(v) => update({ image: v })}
          canEdit={canEdit}
        />
        <div className="brand-block">
          <div className="brand-mark">LIGEIA</div>
          <div className="brand-sub">RPG</div>
          {!isGM && (
            <div className="readonly-badge" title="Apenas o Narrador pode editar">
              👁 Somente leitura
            </div>
          )}
          {isGM && character.npc && (
            <div className="npc-header-badge">NPC (privado)</div>
          )}
          {(() => {
            const owner =
              character.playerId &&
              (party || []).find((p) => p.id === character.playerId);
            if (owner) {
              return (
                <div className="owner-header-badge" title="Jogador atribuído">
                  👤 {owner.name}
                </div>
              );
            }
            return null;
          })()}
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
          {canEdit && (
            <ImportButton
              onImport={async (imported) => {
                // Substitui o conteúdo da ficha atual (mantém id/playerId/tokenIds)
                const next = {
                  ...imported,
                  id: character.id,
                  playerId: character.playerId,
                  tokenIds: character.tokenIds || [],
                };
                setCharacter(next);
                await saveCharacterToRoom(next);
                alert("Ficha importada com sucesso!");
              }}
            />
          )}
          {(isGM || character.playerId === myId) && (
            <>
              <button
                onClick={() => downloadCharacterJson(character)}
                title="Baixar JSON com todos os dados da ficha"
                className="export-btn"
              >
                ⬇ JSON
              </button>
              <button
                onClick={() => openPrintableSheet(character)}
                title="Abrir versão pronta para imprimir ou salvar como PDF"
                className="export-btn"
              >
                ⬇ PDF
              </button>
            </>
          )}
        </div>
      </header>

      {/* Linha de identidade: raça, herança, vocação, modelo, carreiras */}
      <div className="identity-row">
        <div>
          <label>Raça</label>
          <input
            type="text"
            value={character.race}
            onChange={(e) => update({ race: e.target.value })}
            placeholder="Ex: Humano"
            list="ligeia-races"
          />
          <datalist id="ligeia-races">
            {RACES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
        <div>
          <label>Herança</label>
          <input
            type="text"
            value={character.heritage}
            onChange={(e) => update({ heritage: e.target.value })}
            placeholder="—"
            list="ligeia-heritages"
          />
          <datalist id="ligeia-heritages">
            {HERITAGES.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </div>
        <div>
          <label>Vocação</label>
          <input
            type="text"
            value={character.vocation}
            onChange={(e) => update({ vocation: e.target.value })}
            placeholder="Ex: Guerreiro"
            list="ligeia-vocations"
          />
          <datalist id="ligeia-vocations">
            {VOCATIONS.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
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
          <ResourceInput
            current={character.heroicPoints}
            max={resources.heroicMax}
            onChange={(v) => update({ heroicPoints: v })}
            bonus={character.heroicBonus}
            onBonusChange={(v) => update({ heroicBonus: v })}
            showBonus={isGM}
          />
        </div>
      </div>

      <div className="info-bar">
        Clique em qualquer círculo de atributo para rolar 2d6 + atributo +
        dados de melhoria. Os resultados são compartilhados na sala.
      </div>

      {isGM && (
        <GmControls
          character={character}
          tokenName={tokenName}
          onUpdate={update}
        />
      )}

      <ActiveModifiersPanel summary={effectSummary} />

      {/* Grade principal: atributos | habilidades */}
      <div className="sheet-main">
        {/* Coluna esquerda: atributos */}
        <div className="col gap-2">
          <AttributeBlock
            label="FORÇA"
            attr={character.attributes.forca}
            onChange={(p) => updateAttr("forca", p)}
            onRoll={() =>
              rollWith("Força", character.attributes.forca.value, character.attributes.forca.dice, 0, { attribute: "forca" })
            }
            derived={[
              { label: "Bloqueio", value: secondary.bloqueio.value, onRoll: () => rollWith("Bloqueio", secondary.bloqueio.value, secondary.bloqueio.dice, 0, { attribute: "forca" }) },
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
                0,
                { attribute: "agilidade" },
              )
            }
            derived={[
              { label: "Esquiva", value: secondary.esquiva.value, onRoll: () => rollWith("Esquiva", secondary.esquiva.value, secondary.esquiva.dice, 0, { attribute: "agilidade" }) },
              {
                label: "Deslocamento",
                value: (
                  <SecondaryWithBonus
                    value={secondary.deslocamento.value}
                    unit="m"
                    bonus={character.secondary.deslocamento.bonus || 0}
                    onBonusChange={(v) =>
                      update({
                        secondary: {
                          ...character.secondary,
                          deslocamento: {
                            ...character.secondary.deslocamento,
                            bonus: v,
                          },
                        },
                      })
                    }
                    showBonus={isGM}
                  />
                ),
                onRoll: null,
              },
            ]}
          />

          <AttributeBlock
            label="VIGOR"
            attr={character.attributes.vigor}
            onChange={(p) => updateAttr("vigor", p)}
            onRoll={() =>
              rollWith("Vigor", character.attributes.vigor.value, character.attributes.vigor.dice, 0, { attribute: "vigor" })
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
                    bonus={character.hp.bonus}
                    onBonusChange={(v) =>
                      update({ hp: { ...character.hp, bonus: v } })
                    }
                    showBonus={isGM}
                    temp={character.hp.temp || 0}
                    onTempChange={(v) =>
                      update({ hp: { ...character.hp, temp: v } })
                    }
                    showTemp={true}
                  />
                ),
                onRoll: null,
                full: true,
              },
              { label: "Sono, Fome e Sede", value: secondary.sonoFomeSed.value, onRoll: () => rollWith("Vigor (sono/fome/sede)", secondary.sonoFomeSed.value, character.attributes.vigor.dice, 0, { attribute: "vigor" }) },
            ]}
          />

          <AttributeBlock
            label="MENTE"
            attr={character.attributes.mente}
            onChange={(p) => updateAttr("mente", p)}
            onRoll={() =>
              rollWith("Mente", character.attributes.mente.value, character.attributes.mente.dice, 0, { attribute: "mente" })
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
                    bonus={character.mp.bonus}
                    onBonusChange={(v) =>
                      update({ mp: { ...character.mp, bonus: v } })
                    }
                    showBonus={isGM}
                  />
                ),
                onRoll: null,
                full: true,
              },
              { label: "Conjuração", value: secondary.conjuracao.value, onRoll: () => rollWith("Conjuração", secondary.conjuracao.value, secondary.conjuracao.dice, 0, { attribute: "mente" }) },
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
                0,
                { attribute: "percepcao" },
              )
            }
            derived={[
              { label: "Iniciativa", value: secondary.iniciativa.value, onRoll: () => rollWith("Iniciativa", secondary.iniciativa.value, secondary.iniciativa.dice, 0, { attribute: "percepcao", isInitiative: true }) },
              { label: "Percepção Passiva", value: secondary.percepcaoPassiva.value, onRoll: null },
            ]}
          />

          {/* Ataques */}
          <div className="row" style={{ marginTop: "0.5rem", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Ataques</h3>
            <button
              onClick={() =>
                update({
                  attacks: [
                    ...character.attacks,
                    { weapon: "", attribute: "forca", bonus: 0, dice: 0, properties: "" },
                  ],
                })
              }
              style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
            >
              + Adicionar Ataque
            </button>
          </div>
          {character.attacks.length === 0 && (
            <div className="muted tiny" style={{ padding: "0.6rem", textAlign: "center" }}>
              Nenhum ataque cadastrado. Clique em "+ Adicionar Ataque".
            </div>
          )}
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
              onRemove={() => {
                update({ attacks: character.attacks.filter((_, idx) => idx !== i) });
              }}
              onRoll={() => {
                const atVal = character.attributes[atk.attribute]?.value || 0;
                const atDice = character.attributes[atk.attribute]?.dice || 0;
                rollWith(
                  `Ataque: ${atk.weapon || "—"}`,
                  atVal,
                  atDice + (Number(atk.dice) || 0),
                  Number(atk.bonus) || 0,
                  { attribute: atk.attribute, isAttack: true },
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
              const dice = skill.level === "A" ? 2 : skill.level === "B" ? 1 : 0;
              const attrKey = skill.attribute || "mente";
              rollWith(
                skill.name,
                character.attributes[attrKey]?.value || 0,
                (character.attributes[attrKey]?.dice || 0) + dice,
                0,
                { attribute: attrKey, skillName: skill.name },
              );
            }}
          />

          <EquipmentPanel
            items={character.equipment}
            onChange={(equipment) => update({ equipment })}
          />

          <div className="panel">
            <div className="panel-title">Personalidade & Notas</div>
            <textarea
              value={character.personality}
              onChange={(e) => update({ personality: e.target.value })}
              placeholder="Personalidade, traços, ideais, vínculos, defeitos..."
              rows={3}
              className="player-editable"
            />
            <textarea
              value={character.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Notas livres, história, anotações de campanha..."
              rows={4}
              style={{ marginTop: "0.5rem" }}
              className="player-editable"
            />
          </div>
        </div>
      </div>

      {/* Magia */}
      <MagicSection character={character} onChange={update} onRoll={rollWith} />
    </div>
    </EditPermContext.Provider>
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

function ResourceInput({
  current,
  max,
  onChange,
  bonus,
  onBonusChange,
  showBonus,
  temp,
  onTempChange,
  showTemp,
}) {
  // Clampa current ao max (e não-negativo) na hora de aceitar input.
  const handleCurrent = (raw) => {
    const v = Number(raw) || 0;
    onChange(Math.max(0, Math.min(v, max || 0)));
  };
  const handleTemp = (raw) => {
    const v = Number(raw) || 0;
    onTempChange(Math.max(0, v));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
        <input
          type="number"
          value={current}
          min={0}
          max={max}
          onChange={(e) => handleCurrent(e.target.value)}
          className="player-editable"
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
        {showTemp && (
          <span
            className="temp-pip"
            title="Pontos de vida temporários (absorvem dano antes do PV)"
          >
            <span className="temp-plus">+</span>
            <input
              type="number"
              value={temp || 0}
              min={0}
              onChange={(e) => handleTemp(e.target.value)}
              className="player-editable temp-input"
              onClick={(e) => e.stopPropagation()}
            />
            <span className="temp-label">temp</span>
          </span>
        )}
      </div>
      {showBonus && (
        <div className="resource-bonus" title="Bônus/penalidade ao máximo">
          <span className="tiny muted">Ajuste:</span>
          <input
            type="number"
            value={bonus || 0}
            onChange={(e) => onBonusChange(Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            className="resource-bonus-input"
          />
        </div>
      )}
    </div>
  );
}

function AttackBlock({ attack, attributes, onChange, onRoll, onRemove }) {
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
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <input
            type="text"
            value={attack.weapon}
            onChange={(e) => onChange({ weapon: e.target.value })}
            placeholder="Arma"
            style={{ flex: 1 }}
          />
          {onRemove && (
            <button
              className="danger"
              onClick={onRemove}
              style={{ padding: "0.25rem 0.4rem", fontSize: "0.7rem" }}
              title="Remover ataque"
            >
              ✕
            </button>
          )}
        </div>
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
        <ItemEffectsBlock
          item={attack}
          onChange={onChange}
          kind="attack"
        />
      </div>
    </div>
  );
}

function EquipmentPanel({ items, onChange }) {
  const list = Array.isArray(items) ? items : [];
  const addItem = () => {
    onChange([...list, { name: "", qty: 1, weight: 0, notes: "" }]);
  };
  const updateItem = (i, patch) => {
    const copy = [...list];
    copy[i] = { ...copy[i], ...patch };
    onChange(copy);
  };
  const removeItem = (i) => {
    onChange(list.filter((_, idx) => idx !== i));
  };

  const totalWeight = list.reduce(
    (acc, it) => acc + (Number(it.weight) || 0) * (Number(it.qty) || 1),
    0,
  );

  return (
    <div className="panel">
      <div className="panel-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Equipamentos</span>
        <button onClick={addItem} style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}>
          + Adicionar
        </button>
      </div>

      <div className="equipment-header">
        <span>Item</span>
        <span title="Quantidade">Qtd</span>
        <span title="Peso (unitário)">Peso</span>
        <span></span>
      </div>

      <div className="equipment-list">
        {list.length === 0 && (
          <div className="muted tiny" style={{ padding: "1rem 0", textAlign: "center" }}>
            Nenhum equipamento. Clique em "+ Adicionar".
          </div>
        )}
        {list.map((item, i) => (
          <div key={i} className="equipment-row">
            <div className="equipment-main">
              <input
                type="text"
                value={item.name}
                onChange={(e) => updateItem(i, { name: e.target.value })}
                placeholder="Nome do item"
              />
              <input
                type="number"
                value={item.qty}
                min="1"
                onChange={(e) => updateItem(i, { qty: Number(e.target.value) })}
                title="Quantidade"
              />
              <input
                type="number"
                value={item.weight}
                step="0.1"
                onChange={(e) => updateItem(i, { weight: Number(e.target.value) })}
                title="Peso (carga)"
              />
              <button
                className="danger"
                onClick={() => removeItem(i)}
                style={{ padding: "0.25rem 0.4rem", fontSize: "0.7rem" }}
                title="Remover"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={item.notes || ""}
              onChange={(e) => updateItem(i, { notes: e.target.value })}
              placeholder="Notas, propriedades, descrição..."
              className="equipment-notes"
            />
            <ItemEffectsBlock
              item={item}
              onChange={(patch) => updateItem(i, patch)}
              kind="equipment"
            />
          </div>
        ))}
      </div>
      {list.length > 0 && (
        <div className="tiny muted" style={{ marginTop: "0.5rem", textAlign: "right" }}>
          Carga total: <strong style={{ color: "var(--gold)" }}>{totalWeight.toFixed(1)}</strong>
        </div>
      )}
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
          <div key={i} className="skill-card">
            <div className="skill-row">
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
            <ItemEffectsBlock
              item={s}
              onChange={(patch) => updateSkill(i, patch)}
              kind="skill"
            />
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

  const updateMetamagic = (i, j, patch) => {
    const grimoire = [...character.magic.grimoire];
    const metamagics = [...(grimoire[i].metamagics || [])];
    const cur =
      typeof metamagics[j] === "string"
        ? { name: metamagics[j], wordId: "" }
        : metamagics[j] || { name: "", wordId: "" };
    metamagics[j] = { ...cur, ...patch };
    grimoire[i] = { ...grimoire[i], metamagics };
    onChange({ magic: { ...character.magic, grimoire } });
  };

  const addMetamagic = (i) => {
    const grimoire = [...character.magic.grimoire];
    const metamagics = [
      ...(grimoire[i].metamagics || []),
      { name: "", wordId: "", description: "" },
    ];
    grimoire[i] = { ...grimoire[i], metamagics };
    onChange({ magic: { ...character.magic, grimoire } });
  };

  const removeMetamagic = (i, j) => {
    const grimoire = [...character.magic.grimoire];
    const metamagics = (grimoire[i].metamagics || []).filter((_, idx) => idx !== j);
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
        <div className="panel-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Grimório</span>
          <button
            onClick={() =>
              onChange({
                magic: {
                  ...character.magic,
                  grimoire: [
                    ...character.magic.grimoire,
                    { base: "", wordId: "", metamagics: [] },
                  ],
                },
              })
            }
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}
          >
            + Magia Base
          </button>
        </div>
        <p className="tiny muted" style={{ marginBottom: "0.5rem" }}>
          Cada magia base pode ter quantas metamagias forem aprendidas.
        </p>
        {character.magic.grimoire.length === 0 && (
          <div className="muted tiny" style={{ padding: "1rem 0", textAlign: "center" }}>
            Nenhuma magia no grimório. Clique em "+ Magia Base".
          </div>
        )}
        {character.magic.grimoire.map((entry, i) => (
          <div key={i} className="grimoire-entry">
            <div className="grimoire-base-row">
              <div className="base-spell">Magia Base {i + 1}</div>
              <button
                className="danger"
                onClick={() => {
                  const grimoire = character.magic.grimoire.filter((_, idx) => idx !== i);
                  onChange({ magic: { ...character.magic, grimoire } });
                }}
                style={{ padding: "0.15rem 0.35rem", fontSize: "0.65rem" }}
                title="Remover magia base"
              >
                ✕
              </button>
            </div>
            <div className="spell-row">
              <input
                type="text"
                value={entry.base}
                onChange={(e) => updateGrimoire(i, { base: e.target.value })}
                placeholder="Nome da magia base..."
                style={{ flex: 1 }}
              />
              <WordSelect
                value={entry.wordId || ""}
                onChange={(wordId) => updateGrimoire(i, { wordId })}
              />
            </div>
            {(entry.metamagics || []).map((meta, j) => (
              <MetamagicRow
                key={j}
                index={j}
                meta={meta}
                onChange={(patch) => updateMetamagic(i, j, patch)}
                onRemove={() => removeMetamagic(i, j)}
              />
            ))}
            <button
              onClick={() => addMetamagic(i)}
              style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem", marginTop: "0.3rem" }}
            >
              + Metamagia
            </button>
            <ItemEffectsBlock
              item={entry}
              onChange={(patch) => updateGrimoire(i, patch)}
              kind="spell"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================================
   Sistema de Efeitos: modo passivo/ativo + editor de efeitos + painel resumo
   ========================================================================= */

function ActiveToggle({ mode, active, onChange, compact = false, canEdit = true }) {
  const isActive = mode === "active";
  const handleMode = () => {
    if (!canEdit) return;
    if (isActive) {
      onChange({ mode: "passive", active: false });
    } else {
      onChange({ mode: "active", active: false });
    }
  };
  const handleToggle = () => onChange({ active: !active });

  if (!isActive) {
    return (
      <button
        onClick={handleMode}
        className="mode-pill mode-passive"
        title={
          canEdit
            ? "Atualmente passivo - clique para tornar ativável"
            : "Efeito passivo (sempre em uso)"
        }
        disabled={!canEdit}
      >
        {compact ? "P" : "Passivo"}
      </button>
    );
  }

  return (
    <div className="mode-active-wrap">
      <button
        onClick={handleToggle}
        className={"mode-pill " + (active ? "mode-on" : "mode-off")}
        title={active ? "Em uso - clique para desligar" : "Disponível - clique para ativar"}
      >
        {active ? (compact ? "ON" : "Ativado") : (compact ? "off" : "Ativável")}
      </button>
      {canEdit && (
        <button
          onClick={handleMode}
          className="mode-revert"
          title="Voltar para passivo"
        >
          ↺
        </button>
      )}
    </div>
  );
}

function EffectsEditor({ effects, onChange, canEdit = true }) {
  const list = effects || [];
  const addEffect = () => {
    onChange([
      ...list,
      { type: "bonus", target: "all", value: 1, label: "", enabled: true },
    ]);
  };
  const updateEffect = (i, patch) => {
    const copy = [...list];
    copy[i] = { ...copy[i], ...patch };
    onChange(copy);
  };
  const removeEffect = (i) => {
    onChange(list.filter((_, idx) => idx !== i));
  };

  // Quando o tipo muda, ajusta o target default para algo válido
  const onTypeChange = (i, newType) => {
    const e = list[i];
    let target = e.target;
    if (newType === "stat") {
      if (!EFFECT_STAT_TARGETS.find((t) => t.id === target)) target = "max_hp";
    } else if (newType === "set") {
      if (!EFFECT_SET_TARGETS.find((t) => t.id === target)) target = "forca";
    } else if (newType === "dice" || newType === "bonus") {
      if (!EFFECT_ROLL_TARGETS.find((t) => t.id === target)) target = "all";
    }
    updateEffect(i, { type: newType, target });
  };

  return (
    <div className="effects-editor">
      {list.length === 0 && (
        <div className="tiny muted effects-empty">Nenhum efeito.</div>
      )}
      {list.map((e, i) => {
        const enabled = isEffectEnabled(e);
        const isInfo = e.type === "info";
        const isStat = e.type === "stat";
        const isSet = e.type === "set";
        const isRoll = e.type === "dice" || e.type === "bonus";
        const hasTarget = isRoll || isStat || isSet;
        const targets = isSet
          ? EFFECT_SET_TARGETS
          : isStat
          ? EFFECT_STAT_TARGETS
          : EFFECT_ROLL_TARGETS;
        return (
          <div
            key={i}
            className={"effect-row " + (enabled ? "" : "effect-disabled")}
          >
            <button
              className={"effect-enable-btn " + (enabled ? "on" : "off")}
              onClick={() => updateEffect(i, { enabled: !enabled })}
              title={
                enabled
                  ? "Efeito ATIVO — clique para desligar"
                  : "Efeito DESLIGADO — clique para ligar"
              }
            >
              {enabled ? "●" : "○"}
            </button>
            <select
              value={e.type}
              onChange={(ev) => onTypeChange(i, ev.target.value)}
              title="Tipo de efeito"
              disabled={!canEdit}
            >
              {EFFECT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            {hasTarget && (
              <select
                value={e.target}
                onChange={(ev) => updateEffect(i, { target: ev.target.value })}
                title="Alvo do efeito"
                disabled={!canEdit}
              >
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
            {!isInfo && (
              <input
                type="number"
                value={e.value}
                onChange={(ev) =>
                  updateEffect(i, { value: Number(ev.target.value) })
                }
                className="effect-value"
                title="Valor"
                disabled={!canEdit}
              />
            )}
            <input
              type="text"
              value={e.label || ""}
              onChange={(ev) => updateEffect(i, { label: ev.target.value })}
              placeholder={
                isInfo ? "Descreva a condição..." : "Nota (opcional)"
              }
              className="effect-label"
              disabled={!canEdit}
            />
            {canEdit && (
              <button
                className="danger"
                onClick={() => removeEffect(i)}
                style={{ padding: "0.2rem 0.35rem", fontSize: "0.65rem" }}
                title="Remover efeito"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      {canEdit && (
        <button onClick={addEffect} className="effect-add-btn">
          + Adicionar efeito
        </button>
      )}
    </div>
  );
}

/**
 * Bloco unificado de detalhes de um item ativável (habilidade, equipamento, magia).
 * - `kind` define quais campos extras mostrar:
 *     "skill"      → descrições por nível (B/A/E) + alvo/área/alcance/duração
 *     "spell"      → conjurar + alvo/área/alcance/duração
 *     "equipment"  → descrição livre
 *     "attack"     → descrição livre (sem custos/efeitos)
 * - `showCostsEffects` controla se mostra Efeitos e Custos (default true).
 */
function ItemEffectsBlock({ item, onChange, kind = "skill" }) {
  const canEdit = useContext(EditPermContext);

  const hasEffects = (item.effects || []).length > 0;

  // Sempre começa fechado ao montar o componente / abrir a ficha.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const active = isItemActive(item);

  const effCount = (item.effects || []).length;
  const costCount = (item.costs || []).length;
  const showSlots = kind === "skill" || kind === "spell";
  const showCostsEffects = kind !== "attack";

  return (
    <div className={"item-effects " + (active && hasEffects ? "is-active" : "")}>
      <div className="item-effects-bar">
        {showCostsEffects && (
          <ActiveToggle
            mode={item.mode}
            active={item.active}
            onChange={(patch) => onChange(patch)}
            compact
            canEdit={canEdit}
          />
        )}
        <button
          className="effects-toggle"
          onClick={() => setDetailsOpen(!detailsOpen)}
          title={detailsOpen ? "Ocultar detalhes" : "Mostrar detalhes"}
        >
          🔍 Detalhes
          {costCount > 0 && (
            <span className="effects-badge cost-badge" title="Custos">
              ◈ {costCount}
            </span>
          )}
          <span className="effects-chevron">{detailsOpen ? "▾" : "▸"}</span>
        </button>
        {showCostsEffects && (
          <button
            className="effects-toggle"
            onClick={() => setEffectsOpen(!effectsOpen)}
            title={effectsOpen ? "Ocultar efeitos" : "Mostrar efeitos"}
          >
            ⚙ Efeitos
            {effCount > 0 && (
              <span className="effects-badge" title="Quantidade de efeitos">
                {effCount}
              </span>
            )}
            <span className="effects-chevron">{effectsOpen ? "▾" : "▸"}</span>
          </button>
        )}
      </div>

      {detailsOpen && (
        <div className="item-details-body">
          {/* Slots de ficha técnica */}
          {showSlots && (
            <SlotsEditor
              item={item}
              kind={kind}
              onChange={onChange}
              canEdit={canEdit}
            />
          )}

          {/* Descrição(ões) */}
          {kind === "skill" ? (
            <SkillDescriptions item={item} onChange={onChange} canEdit={canEdit} />
          ) : (
            <DescriptionField
              value={item.description || ""}
              onChange={(v) => onChange({ description: v })}
              canEdit={canEdit}
            />
          )}

          {/* Peculiaridades — exclusivo de magias */}
          {kind === "spell" && (
            <DescriptionField
              value={item.peculiarities || ""}
              onChange={(v) => onChange({ peculiarities: v })}
              canEdit={canEdit}
              label="Peculiaridades"
            />
          )}

          {/* Custos */}
          {showCostsEffects && (
            <CostsEditor
              costs={item.costs || []}
              onChange={(costs) => onChange({ costs })}
              canEdit={canEdit}
            />
          )}
        </div>
      )}

      {effectsOpen && showCostsEffects && (
        <div className="item-details-body">
          <EffectsEditor
            effects={item.effects || []}
            onChange={(effects) => onChange({ effects })}
            canEdit={canEdit}
          />
        </div>
      )}
    </div>
  );
}

function SlotsEditor({ item, kind, onChange, canEdit }) {
  return (
    <div className="slots-grid">
      {kind === "spell" && (
        <SlotInput
          label="Conjurar"
          value={item.casting || ""}
          onChange={(v) => onChange({ casting: v })}
          canEdit={canEdit}
        />
      )}
      {kind === "skill" && (
        <SlotInput
          label="Ativação"
          value={item.activation || ""}
          onChange={(v) => onChange({ activation: v })}
          canEdit={canEdit}
        />
      )}
      <SlotInput
        label="Alvo"
        value={item.target || ""}
        onChange={(v) => onChange({ target: v })}
        canEdit={canEdit}
      />
      <SlotInput
        label="Área"
        value={item.area || ""}
        onChange={(v) => onChange({ area: v })}
        canEdit={canEdit}
      />
      <SlotInput
        label="Alcance"
        value={item.range || ""}
        onChange={(v) => onChange({ range: v })}
        canEdit={canEdit}
      />
      <SlotInput
        label="Duração"
        value={item.duration || ""}
        onChange={(v) => onChange({ duration: v })}
        canEdit={canEdit}
      />
    </div>
  );
}

function SlotInput({ label, value, onChange, canEdit }) {
  return (
    <div className="slot-input">
      <label>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!canEdit}
        placeholder="—"
      />
    </div>
  );
}

function DescriptionField({ value, onChange, canEdit, label = "Descrição" }) {
  return (
    <div className="desc-field">
      <label>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!canEdit}
        placeholder="—"
        rows={3}
      />
    </div>
  );
}

function SkillDescriptions({ item, onChange, canEdit }) {
  return (
    <div className="skill-descs">
      <DescriptionField
        value={item.descBasic || ""}
        onChange={(v) => onChange({ descBasic: v })}
        canEdit={canEdit}
        label="Descrição — Básico"
      />
      <DescriptionField
        value={item.descAdvanced || ""}
        onChange={(v) => onChange({ descAdvanced: v })}
        canEdit={canEdit}
        label="Descrição — Avançado"
      />
      <DescriptionField
        value={item.descSpecial || ""}
        onChange={(v) => onChange({ descSpecial: v })}
        canEdit={canEdit}
        label="Descrição — Especial"
      />
    </div>
  );
}

const COST_RESOURCES = [
  { id: "mp", label: "Mana (PM)" },
  { id: "hp", label: "Vida (PV)" },
  { id: "hpTemp", label: "Vida temporária" },
  { id: "heroic", label: "Ponto Heroico" },
];

function CostsEditor({ costs, onChange, canEdit }) {
  const list = costs || [];
  const addCost = () => {
    onChange([...list, { resource: "mp", value: 1, label: "" }]);
  };
  const updateCost = (i, patch) => {
    const copy = [...list];
    copy[i] = { ...copy[i], ...patch };
    onChange(copy);
  };
  const removeCost = (i) => {
    onChange(list.filter((_, idx) => idx !== i));
  };

  return (
    <div className="costs-editor">
      <div className="costs-title">Custos</div>
      {list.length === 0 && (
        <div className="tiny muted effects-empty">Sem custos.</div>
      )}
      {list.map((c, i) => (
        <div key={i} className="cost-row">
          <select
            value={c.resource}
            onChange={(e) => updateCost(i, { resource: e.target.value })}
            disabled={!canEdit}
            title="Recurso gasto"
          >
            {COST_RESOURCES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={c.value}
            onChange={(e) => updateCost(i, { value: Number(e.target.value) })}
            disabled={!canEdit}
            className="cost-value"
            title="Quantidade gasta"
          />
          <input
            type="text"
            value={c.label || ""}
            onChange={(e) => updateCost(i, { label: e.target.value })}
            disabled={!canEdit}
            placeholder="Nota (opcional)"
            className="cost-label"
          />
          {canEdit && (
            <button
              className="danger"
              onClick={() => removeCost(i)}
              style={{ padding: "0.2rem 0.35rem", fontSize: "0.65rem" }}
              title="Remover custo"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <button onClick={addCost} className="effect-add-btn">
          + Adicionar custo
        </button>
      )}
    </div>
  );
}

function ActiveModifiersPanel({ summary }) {
  const {
    rollBuckets,
    damageBonus,
    damageParts,
    damageReduction,
    rdParts,
    conditions,
    stats,
  } = summary;
  const empty =
    rollBuckets.length === 0 &&
    damageParts.length === 0 &&
    rdParts.length === 0 &&
    conditions.length === 0 &&
    (stats || []).length === 0;

  if (empty) return null;

  return (
    <div className="active-modifiers-panel">
      <div className="active-modifiers-header">
        ⚡ Modificadores Ativos
      </div>
      <div className="active-modifiers-grid">
        {rollBuckets.map((b, i) => (
          <div key={i} className="mod-line">
            <strong>{b.label}:</strong>{" "}
            {b.dice ? <span className="mod-dice">+{b.dice}D</span> : null}
            {b.bonus ? <span className="mod-bonus">{b.bonus >= 0 ? "+" : ""}{b.bonus}</span> : null}
            <span className="mod-parts">{b.parts.join(" · ")}</span>
          </div>
        ))}
        {(stats || []).map((s, i) => (
          <div key={`stat-${i}`} className="mod-line">
            <strong>{s.label}:</strong>{" "}
            <span className="mod-bonus">
              {s.delta >= 0 ? "+" : ""}
              {s.delta}
            </span>
            <span className="mod-parts">{s.parts.join(" · ")}</span>
          </div>
        ))}
        {damageParts.length > 0 && (
          <div className="mod-line">
            <strong>Bônus de Dano:</strong>{" "}
            <span className="mod-bonus">{damageBonus >= 0 ? "+" : ""}{damageBonus}</span>
            <span className="mod-parts">{damageParts.join(" · ")}</span>
          </div>
        )}
        {rdParts.length > 0 && (
          <div className="mod-line">
            <strong>Redução de Dano:</strong>{" "}
            <span className="mod-bonus">{damageReduction >= 0 ? "+" : ""}{damageReduction}</span>
            <span className="mod-parts">{rdParts.join(" · ")}</span>
          </div>
        )}
        {conditions.length > 0 && (
          <div className="mod-line">
            <strong>Condições:</strong>{" "}
            <span className="mod-parts">
              {conditions.map((c, i) => (
                <span key={i} className="condition-chip">
                  {c.text}
                  {c.source ? <span className="condition-source"> ({c.source})</span> : null}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   Barra de controles do Narrador (NPC + player + tokens vinculados)
   ========================================================================= */
function GmControls({ character, tokenName, onUpdate }) {
  const [linking, setLinking] = useState(false);
  const [party, setParty] = useState([]);

  useEffect(() => {
    return onPartyChange(setParty);
  }, []);

  const players = party.filter((p) => p.role === "PLAYER");

  const pushBars = (tokenId) => {
    const eff = collectActiveEffects(character);
    const res = deriveResources(character, eff);
    updateTokenBars(
      tokenId,
      character.id,
      {
        hp: { current: character.hp.current, max: res.hpMax },
        mp: { current: character.mp.current, max: res.mpMax },
        hero: { current: character.heroicPoints, max: res.heroicMax },
      },
      !!character.npc,
    );
  };

  const handleAddTokenLink = async () => {
    setLinking(true);
    const sel = await getSelectedItemIds();
    if (sel.length === 0) {
      alert(
        "Nenhum token selecionado.\nSelecione um ou mais tokens na cena e clique novamente em Adicionar.",
      );
      setLinking(false);
      return;
    }
    const current = character.tokenIds || [];
    const next = [...current];
    for (const itemId of sel) {
      if (!next.includes(itemId)) {
        next.push(itemId);
        await linkCharacterToItem(itemId, character.id);
        pushBars(itemId);
      }
    }
    onUpdate({ tokenIds: next });
    setLinking(false);
  };

  const handleRemoveTokenLink = async (tokenId) => {
    if (!confirm("Desvincular este token da ficha?")) return;
    await unlinkItem(tokenId);
    const next = (character.tokenIds || []).filter((id) => id !== tokenId);
    onUpdate({ tokenIds: next });
    // Se for o último, remove as barras
    if (next.length === 0) {
      await removeTokenBars(character.id);
    }
  };

  const handleClearAllTokens = async () => {
    if (!confirm("Desvincular TODOS os tokens desta ficha?")) return;
    for (const tid of character.tokenIds || []) {
      await unlinkItem(tid);
    }
    await removeTokenBars(character.id);
    onUpdate({ tokenIds: [] });
  };

  const tokenCount = (character.tokenIds || []).length;

  return (
    <div className="gm-controls">
      <div className="gm-controls-section">
        <label className="gm-toggle">
          <input
            type="checkbox"
            checked={!!character.npc}
            onChange={(e) => {
              const npc = e.target.checked;
              // Ao tornar NPC, ligamos rolagens ocultas por padrão.
              // Ao deixar de ser NPC, mantemos a configuração atual.
              onUpdate({ npc, ...(npc ? { rollHidden: true } : {}) });
            }}
          />
          <span>Marcar como NPC (oculto dos jogadores)</span>
        </label>
        <label className="gm-toggle" style={{ marginTop: "0.4rem" }}>
          <input
            type="checkbox"
            checked={!!character.rollHidden}
            onChange={(e) => onUpdate({ rollHidden: e.target.checked })}
          />
          <span>
            🕶 Rolar ocultamente
            <div className="tiny muted" style={{ fontWeight: "normal", marginTop: "0.15rem" }}>
              Jogadores veem "???" no resultado até o Narrador revelar.
            </div>
          </span>
        </label>
        {!character.npc && (
          <div style={{ marginTop: "0.5rem" }}>
            <div className="tiny muted" style={{ marginBottom: "0.2rem" }}>
              Atribuir esta ficha a um jogador:
            </div>
            <select
              value={character.playerId || ""}
              onChange={(e) =>
                onUpdate({ playerId: e.target.value || null })
              }
              style={{ width: "100%" }}
            >
              <option value="">— sem dono —</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="tiny muted" style={{ marginTop: "0.25rem" }}>
              Quando esse jogador adicionar um token à cena, ele é vinculado
              a esta ficha automaticamente.
            </div>
            {character.playerId && (
              <label
                className="gm-toggle gm-grant-toggle"
                style={{ marginTop: "0.5rem" }}
              >
                <input
                  type="checkbox"
                  checked={!!character.grantPlayerGmAccess}
                  onChange={(e) =>
                    onUpdate({ grantPlayerGmAccess: e.target.checked })
                  }
                />
                <span>
                  🗝 Dar acesso de Narrador ao jogador
                  <div className="tiny muted" style={{ fontWeight: "normal", marginTop: "0.15rem" }}>
                    Permite que o jogador dono edite esta ficha como GM
                    (atributos, equipamentos, etc).
                  </div>
                </span>
              </label>
            )}
          </div>
        )}
      </div>

      <div className="gm-controls-section">
        <div className="gm-token-label">
          Tokens vinculados:{" "}
          {tokenCount > 0 ? (
            <strong style={{ color: "var(--gold)" }}>
              {tokenName || "—"} ({tokenCount})
            </strong>
          ) : (
            <span className="muted">nenhum</span>
          )}
        </div>
        <div className="row gap-2" style={{ flexWrap: "wrap" }}>
          <button
            onClick={handleAddTokenLink}
            disabled={linking}
            style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
          >
            🔗 Adicionar token(s) selecionado(s)
          </button>
          {tokenCount > 0 && (
            <button
              className="danger"
              onClick={handleClearAllTokens}
              style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
            >
              Limpar todos
            </button>
          )}
        </div>
        {tokenCount > 0 && (
          <TokenList
            tokenIds={character.tokenIds}
            onRemove={handleRemoveTokenLink}
          />
        )}
        <div className="tiny muted" style={{ marginTop: "0.3rem" }}>
          Múltiplos tokens podem compartilhar esta ficha. Para abrir a ficha
          pelo menu de um token vinculado, clique com o botão direito nele.
        </div>
      </div>
    </div>
  );
}

function TokenList({ tokenIds, onRemove }) {
  const [items, setItems] = useState({});
  useEffect(() => {
    (async () => {
      const out = {};
      for (const tid of tokenIds) {
        const it = await getItemById(tid);
        out[tid] = it?.name || it?.text?.plainText || "Token";
      }
      setItems(out);
    })();
  }, [tokenIds.join("|")]);

  return (
    <ul className="token-mini-list">
      {tokenIds.map((tid) => (
        <li key={tid}>
          <span className="token-name">{items[tid] || "…"}</span>
          <button
            className="danger"
            onClick={() => onRemove(tid)}
            style={{ padding: "0.1rem 0.35rem", fontSize: "0.65rem" }}
            title="Desvincular este token"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

/* =========================================================================
   Botão de importação JSON (com input file escondido)
   ========================================================================= */
function ImportButton({ onImport }) {
  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo depois
    if (!file) return;
    if (!confirm(
      "Importar substituirá os dados atuais da ficha por aqueles do arquivo. " +
        "O ID, vínculo com jogador e tokens serão preservados.\n\nContinuar?",
    )) {
      return;
    }
    try {
      const text = await readFileAsText(file);
      const imported = parseImportedJson(text);
      await onImport(imported);
    } catch (err) {
      alert("Falha ao importar:\n" + (err?.message || err));
    }
  };

  return (
    <label className="import-btn" title="Carregar dados de um arquivo JSON">
      ⬆ JSON
      <input
        type="file"
        accept="application/json,.json"
        onChange={handleChange}
        style={{ display: "none" }}
      />
    </label>
  );
}

/* =========================================================================
   Retrato do personagem (imagem em data URL)
   ========================================================================= */
function PortraitInput({ value, onChange, canEdit }) {
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Aceita até ~5MB (acima disso o data URL pesa demais na room metadata)
    if (file.size > 5 * 1024 * 1024) {
      alert("Imagem muito grande (máx 5MB). Use uma versão menor.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result || ""));
    reader.onerror = () => alert("Falha ao ler a imagem.");
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    if (confirm("Remover a imagem do personagem?")) onChange("");
  };

  if (value) {
    return (
      <div className="portrait-wrap has-image">
        <img src={value} alt="Retrato" className="portrait-img" />
        {canEdit && (
          <div className="portrait-controls">
            <label className="portrait-btn">
              ✎
              <input
                type="file"
                accept="image/*"
                onChange={handleFile}
                style={{ display: "none" }}
              />
            </label>
            <button
              className="portrait-btn danger"
              onClick={handleClear}
              title="Remover imagem"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="portrait-wrap empty">
        <span className="portrait-placeholder">sem retrato</span>
      </div>
    );
  }

  return (
    <label className="portrait-wrap empty editable" title="Adicionar imagem">
      <span className="portrait-placeholder">+ retrato</span>
      <input
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: "none" }}
      />
    </label>
  );
}

/* =========================================================================
   Valor derivado com bônus opcional do Narrador (ex: Deslocamento)
   ========================================================================= */
function SecondaryWithBonus({ value, unit, bonus, onBonusChange, showBonus }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
        <span>{value}</span>
        {unit && (
          <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
            {unit}
          </span>
        )}
      </div>
      {showBonus && (
        <div className="resource-bonus" title="Bônus/penalidade do Narrador">
          <span className="tiny muted">Ajuste:</span>
          <input
            type="number"
            value={bonus || 0}
            onChange={(e) => onBonusChange(Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            className="resource-bonus-input"
          />
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   Seletor de Palavra Arcana (usado em magias base e metamagias)
   ========================================================================= */
function WordSelect({ value, onChange }) {
  const canEdit = useContext(EditPermContext);
  return (
    <select
      className="word-select"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={!canEdit}
      title="Palavra arcana"
    >
      <option value="">— palavra —</option>
      {ARCANE_WORDS.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}

/* =========================================================================
   Metamagia: linha + botão Detalhes que mostra a descrição
   ========================================================================= */
function MetamagicRow({ index, meta, onChange, onRemove }) {
  const canEdit = useContext(EditPermContext);
  const [open, setOpen] = useState(false);

  return (
    <div className="metamagic">
      <label>Metamagia {index + 1}</label>
      <div className="spell-row">
        <input
          type="text"
          value={meta.name || ""}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="—"
          style={{ flex: 1 }}
        />
        <WordSelect
          value={meta.wordId || ""}
          onChange={(wordId) => onChange({ wordId })}
        />
        <button
          className="effects-toggle"
          onClick={() => setOpen(!open)}
          title={open ? "Ocultar descrição" : "Mostrar descrição"}
        >
          🔍 Detalhes
          <span className="effects-chevron">{open ? "▾" : "▸"}</span>
        </button>
        {canEdit && (
          <button
            className="danger"
            onClick={onRemove}
            style={{ padding: "0.2rem 0.4rem", fontSize: "0.65rem" }}
            title="Remover metamagia"
          >
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="item-details-body" style={{ marginTop: "0.4rem" }}>
          <DescriptionField
            value={meta.description || ""}
            onChange={(v) => onChange({ description: v })}
            canEdit={canEdit}
          />
        </div>
      )}
    </div>
  );
}
