import { useState, useMemo } from "react";
import { ARCANE_WORDS } from "../data/magicWords.js";

/**
 * Extrai opções de subgrupo de uma string da biblioteca.
 * Lida com descrições que têm prefixo antes de ":" e ignora fragmentos
 * longos demais para serem opções.
 */
function parseSubgroupOptions(raw) {
  if (!raw) return [];
  const afterColon = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
  return afterColon
    .split(/[;,]/)
    .map((o) => o.trim())
    .filter((o) => o && o.length <= 60);
}

/**
 * Modal de seleção a partir de uma biblioteca de itens.
 *
 * Props:
 *  - title: título do modal (ex: "Adicionar Habilidade")
 *  - library: array de itens (skillsLibrary, spellsLibrary, equipmentLibrary)
 *  - kind: "skill" | "spell" | "equipment"
 *  - onPick: callback chamado ao escolher um item. Recebe (item, extra) onde
 *    item é o objeto bruto da biblioteca (ou null se "Criar novo") e extra é
 *    um objeto opcional com escolhas adicionais ({ subgroup }).
 *  - onClose: cancelar
 */
export function LibraryPicker({ title, library, kind, onPick, onClose }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [chosenSubgroup, setChosenSubgroup] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter((it) => {
      const name = (it.name || "").toLowerCase();
      const desc =
        (it.descBasic || it.description || it.effect || "").toLowerCase();
      const word = it.wordId
        ? (ARCANE_WORDS.find((w) => w.id === it.wordId)?.name || "").toLowerCase()
        : "";
      return name.includes(q) || desc.includes(q) || word.includes(q);
    });
  }, [library, search]);

  const selected = library.find((it) => it.id === selectedId);

  // Opções de subgrupo da habilidade selecionada (só para kind=skill)
  const subgroupOptions =
    kind === "skill" && selected ? parseSubgroupOptions(selected.subgroups) : [];
  const hasSubgroups = subgroupOptions.length > 0;

  const handleConfirm = () => {
    if (selectedId === "__new__") {
      onPick(null);
    } else if (selected) {
      onPick(selected, { subgroup: chosenSubgroup });
    } else {
      // Nada selecionado — comportamento padrão: criar novo
      onPick(null);
    }
  };

  return (
    <div className="library-picker-overlay" onClick={onClose}>
      <div className="library-picker-card" onClick={(e) => e.stopPropagation()}>
        <header className="library-picker-header">
          <h3>{title}</h3>
          <button className="dismiss" onClick={onClose} title="Fechar">
            ✕
          </button>
        </header>

        <div className="library-picker-body">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, descrição ou palavra..."
            className="library-search"
            autoFocus
          />

          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setChosenSubgroup(""); // reseta subgrupo ao trocar de item
            }}
            size={12}
            className="library-list"
          >
            <option value="__new__">
              ✨ Criar novo (em branco)
            </option>
            {filtered.map((it) => {
              let label = it.name;
              if (kind === "spell" && it.tier) {
                const wordName = it.wordId
                  ? ARCANE_WORDS.find((w) => w.id === it.wordId)?.name
                  : null;
                label = wordName
                  ? `${it.name} — ${wordName} (${it.tier})`
                  : `${it.name} (${it.tier})`;
              } else if (kind === "skill" && it.prereq) {
                label = `${it.name} [pré-req: ${it.prereq}]`;
              } else if (kind === "equipment" && it.category) {
                label = `${it.name} — ${it.category}`;
              } else if (kind === "trait" && it.source) {
                label = `${it.name} — ${it.source}`;
              }
              return (
                <option key={it.id} value={it.id}>
                  {label}
                </option>
              );
            })}
          </select>

          {/* Preview do item selecionado */}
          {selectedId && selectedId !== "__new__" && selected && (
            <div className="library-preview">
              <h4>{selected.name}</h4>
              {kind === "skill" && (
                <>
                  {selected.prereq && (
                    <p>
                      <strong>Pré-requisito:</strong> {selected.prereq}
                    </p>
                  )}
                  {selected.lists && (
                    <p className="muted small">
                      <strong>Listas:</strong> {selected.lists}
                    </p>
                  )}
                  {selected.descBasic && (
                    <div>
                      <strong>Básico:</strong> {selected.descBasic}
                    </div>
                  )}
                  {selected.descAdvanced && (
                    <div style={{ marginTop: "0.4rem" }}>
                      <strong>Avançado:</strong> {selected.descAdvanced}
                    </div>
                  )}
                  {selected.descSpecial && (
                    <div style={{ marginTop: "0.4rem" }}>
                      <strong>Especial:</strong> {selected.descSpecial}
                    </div>
                  )}
                  {hasSubgroups && (
                    <div className="picker-subgroup">
                      <label>Escolha o subgrupo:</label>
                      <select
                        value={chosenSubgroup}
                        onChange={(e) => setChosenSubgroup(e.target.value)}
                        className="subgroup-select"
                      >
                        <option value="">— selecione —</option>
                        {subgroupOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
              {kind === "spell" && (
                <>
                  <p className="muted small">
                    {selected.tier}
                    {selected.wordId
                      ? " — " +
                        (ARCANE_WORDS.find((w) => w.id === selected.wordId)
                          ?.name || selected.wordId)
                      : ""}
                  </p>
                  <p>{selected.description}</p>
                  {selected.effect && (
                    <p>
                      <strong>Efeito:</strong> {selected.effect}
                    </p>
                  )}
                  <p className="muted small">
                    {selected.casting && `Conjurar: ${selected.casting}. `}
                    {selected.target && `Alvo: ${selected.target}. `}
                    {selected.area && `Área: ${selected.area}. `}
                    {selected.range && `Alcance: ${selected.range}. `}
                    {selected.duration && `Duração: ${selected.duration}.`}
                  </p>
                </>
              )}
              {kind === "equipment" && (
                <>
                  {selected.category && (
                    <p className="muted small">
                      <strong>Categoria:</strong> {selected.category}
                    </p>
                  )}
                  <p>{selected.description}</p>
                  {selected.properties && (
                    <p>
                      <strong>Propriedades:</strong> {selected.properties}
                    </p>
                  )}
                  {selected.price && (
                    <p className="muted small">
                      <strong>Preço:</strong> {selected.price}
                    </p>
                  )}
                </>
              )}
              {kind === "trait" && (
                <>
                  {selected.source && (
                    <p className="muted small">
                      <strong>Origem:</strong> {selected.source}
                    </p>
                  )}
                  <p>{selected.description}</p>
                </>
              )}
            </div>
          )}

          {selectedId === "__new__" && (
            <div className="library-preview">
              <p className="muted">
                Será criado um item em branco para você preencher do zero.
              </p>
            </div>
          )}
        </div>

        <footer className="library-picker-footer">
          <button onClick={onClose}>Cancelar</button>
          <button className="primary" onClick={handleConfirm}>
            Adicionar
          </button>
        </footer>
      </div>
    </div>
  );
}
