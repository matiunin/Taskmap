import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SelectedCard } from './contexts';
import { useTranslation } from '../../i18n';

const LINK_TYPE_OPTIONS: { value: string; icon: string; labelKey: string }[] = [
  { value: 'Child', icon: 'lni-paperclip-1', labelKey: 'mindmap.childEpic' },
  { value: 'Relates', icon: 'lni-link-2-angular-right', labelKey: 'mindmap.relates' },
  { value: 'Blocks', icon: 'lni-ban-2', labelKey: 'mindmap.blocks' },
  { value: 'Cloners', icon: 'lni-clipboard', labelKey: 'mindmap.clones' },
  { value: 'Duplicate', icon: 'lni-clipboard', labelKey: 'mindmap.duplicate' },
];

const LinkTypeSelect: React.FC<{ value: string; onChange: (v: string) => void; childLabelKey?: string }> = ({ value, onChange, childLabelKey }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);
  const selected = LINK_TYPE_OPTIONS.find(o => o.value === value) || LINK_TYPE_OPTIONS[0];
  const getLabel = (o: typeof LINK_TYPE_OPTIONS[0]) => o.value === 'Child' && childLabelKey ? t(childLabelKey) : t(o.labelKey);
  return (
    <div className="add-link-type-select" ref={ref}>
      <button type="button" className="add-link-type-trigger" onClick={() => setOpen(!open)}>
        <i className={`lni ${selected.icon}`} aria-hidden />
        <span>{getLabel(selected)}</span>
        <i className={`lni lni-chevron-down add-link-type-chevron ${open ? 'open' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="add-link-type-dropdown">
          {LINK_TYPE_OPTIONS.map(o => (
            <button key={o.value} type="button" className={`add-link-type-option ${o.value === value ? 'selected' : ''}`} onClick={() => { onChange(o.value); setOpen(false); }}>
              <i className={`lni ${o.icon}`} aria-hidden />
              <span>{getLabel(o)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
import { jiraApi } from '../../utils/jiraApi';
import { parseJiraUrl } from '../../utils/issueParser';
import type { AutomationManualRule, AutomationInputValue } from '../../types';

interface IssueTypeOption {
  id: string;
  name: string;
  subtask: boolean;
}

interface ActionBarProps {
  selectedCards: SelectedCard[];
  onClearSelection: () => void;
  onLoadTask?: (issueKey: string, taskId?: string) => void;
  onLoadParentChain?: (issueKey: string) => void;
  onDeleteLink?: (taskId: string, linkId: string, issueKey: string) => void;
  onDeleteIssue?: (taskId: string, issueKey: string) => void;
  onCreateLink?: (taskId: string, targetKey: string, linkType: string, isOutward: boolean) => void;
  onCrossLink?: (sourceTaskId: string, sourceIssueKey: string, targetTaskId: string, targetIssueKey: string, linkType: string) => void;
  onAddChild?: (parentTaskId: string, parentKey: string, childKey: string) => void;
  onChangeIssueType?: (taskId: string, issueKey: string, newIssueTypeId: string, newIssueTypeName: string, oldIssueTypeName: string) => void;
  existingIssues?: { key: string; summary: string }[];
  jiraBaseUrl: string;
  hasApplyBar: boolean;
  onPreviewTask?: (issueKey: string) => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  selectedCards, onClearSelection, onLoadTask, onLoadParentChain, onDeleteLink, onDeleteIssue,
  onCreateLink, onCrossLink, onAddChild, onChangeIssueType, existingIssues, jiraBaseUrl, hasApplyBar, onPreviewTask,
}) => {
  const { t } = useTranslation();
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showCrossLinkDialog, setShowCrossLinkDialog] = useState(false);
  const [showChangeTypeDialog, setShowChangeTypeDialog] = useState(false);
  const [issueTypes, setIssueTypes] = useState<IssueTypeOption[]>([]);
  const [issueTypesLoading, setIssueTypesLoading] = useState(false);
  const [selectedLinkType, setSelectedLinkType] = useState('Relates');
  const [isOutward, setIsOutward] = useState(true);
  const [linkInput, setLinkInput] = useState('');
  const [parentIndex, setParentIndex] = useState(0);
  const [showAutomation, setShowAutomation] = useState(false);
  const [automationRules, setAutomationRules] = useState<AutomationManualRule[]>([]);
  const [automationInputs, setAutomationInputs] = useState<Record<string, Record<string, any>>>({});
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);
  const [automationLoaded, setAutomationLoaded] = useState(false);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);

  const count = selectedCards.length;
  const singleCard = count === 1 ? selectedCards[0] : null;
  const twoCards = count === 2 ? selectedCards : null;

  const hasNonRootCards = selectedCards.some(c => c.nodeType !== 'root');

  // Все выбранные карточки одного типа — можно менять тип массово
  const uniqueIssueTypes = new Set(selectedCards.map(c => c.issue.issueType?.toLowerCase() || ''));
  const allSameType = count >= 1 && uniqueIssueTypes.size === 1;
  const firstCardForType = selectedCards[0];

  const epicCard = twoCards?.find(c =>
    c.issue.issueType?.toLowerCase().includes('epic') || c.issue.issueType?.toLowerCase().includes('эпик')
  );
  const nonEpicCard = twoCards?.find(c =>
    !c.issue.issueType?.toLowerCase().includes('epic') && !c.issue.issueType?.toLowerCase().includes('эпик')
  );
  const canAddChild = twoCards && twoCards[0].issueKey !== twoCards[1].issueKey;

  const handleOpenInJira = () => {
    const card = selectedCards[0];
    if (!card) return;
    if (onPreviewTask) {
      onPreviewTask(card.issueKey);
      /* На десктопе не сбрасываем выделение — ActionBar и выбор остаются */
    } else {
      window.open(`${jiraBaseUrl}/browse/${card.issueKey}`, '_blank');
      onClearSelection();
    }
  };

  const handleOpenLinks = () => {
    selectedCards.forEach(card => { if (onLoadTask) onLoadTask(card.issueKey); });
    onClearSelection();
  };

  const handleDeleteLink = () => {
    selectedCards.forEach(card => { if (card.linkId && onDeleteLink) onDeleteLink(card.taskId, card.linkId, card.issueKey); });
    onClearSelection();
  };

  const handleDeleteIssue = () => {
    if (singleCard && onDeleteIssue) onDeleteIssue(singleCard.taskId, singleCard.issueKey);
    onClearSelection();
  };

  const handleCreateLink = () => {
    if (!linkInput.trim() || !singleCard || !onCreateLink) return;
    const targetKey = parseJiraUrl(linkInput.trim());
    if (!targetKey) return;
    onCreateLink(singleCard.taskId, targetKey, selectedLinkType, isOutward);
    setShowLinkDialog(false);
    setLinkInput('');
    onClearSelection();
  };

  const handleSelectExisting = (key: string) => {
    if (!singleCard || !onCreateLink) return;
    onCreateLink(singleCard.taskId, key, selectedLinkType, isOutward);
    setShowLinkDialog(false);
    setLinkInput('');
    onClearSelection();
  };

  const handleCreateCrossLink = () => {
    if (!twoCards) return;
    if (selectedLinkType === 'Child') {
      if (!onAddChild) return;
      const parent = twoCards[parentIndex];
      const child = twoCards[parentIndex === 0 ? 1 : 0];
      onAddChild(parent.taskId, parent.issueKey, child.issueKey);
      setShowCrossLinkDialog(false);
      onClearSelection();
      return;
    }
    if (!onCrossLink) return;
    const [first, second] = isOutward ? twoCards : [twoCards[1], twoCards[0]];
    onCrossLink(first.taskId, first.issueKey, second.taskId, second.issueKey, selectedLinkType);
    setShowCrossLinkDialog(false);
    onClearSelection();
  };

  const handleAddChild = () => {
    if (!canAddChild || !twoCards || !onAddChild) return;
    if (epicCard && nonEpicCard) {
      onAddChild(epicCard.taskId, epicCard.issueKey, nonEpicCard.issueKey);
    } else {
      const parent = twoCards[parentIndex];
      const child = twoCards[parentIndex === 0 ? 1 : 0];
      onAddChild(parent.taskId, parent.issueKey, child.issueKey);
    }
    onClearSelection();
  };

  // Automation
  useEffect(() => {
    // Reset on selection change
    setShowAutomation(false);
    setAutomationRules([]);
    setAutomationInputs({});
    setAutomationError(null);
    setAutomationMessage(null);
    setRunningRuleId(null);
    setAutomationLoaded(false);
    setSelectedAutomationId(null);
  }, [selectedCards.map(c => c.issueKey).join(',')]);

  const initAutomationInputs = (rules: AutomationManualRule[]) => {
    const initial: Record<string, Record<string, any>> = {};
    rules.forEach((rule) => {
      if (!rule.userInputs) return;
      initial[rule.id] = {};
      rule.userInputs.forEach((input) => {
        if (input.defaultValue !== undefined) {
          const dv = input.defaultValue;
          initial[rule.id][input.variableName] = Array.isArray(dv) ? dv[0] : dv;
        }
      });
    });
    setAutomationInputs(initial);
  };

  const fetchAutomation = async () => {
    if (!singleCard) return;
    setAutomationLoading(true);
    setAutomationLoaded(false);
    setAutomationError(null);
    setAutomationMessage(null);
    try {
      const rules = await jiraApi.getManualRulesForIssue(singleCard.issueKey);
      setAutomationRules(rules);
      initAutomationInputs(rules);
    } catch (err: any) {
      setAutomationRules([]);
      setAutomationError(err.message || t('notification.loadError'));
    } finally {
      setAutomationLoading(false);
      setAutomationLoaded(true);
    }
  };

  const handleAutomationInputChange = (ruleId: string, variable: string, value: any) => {
    setAutomationInputs((prev) => ({
      ...prev,
      [ruleId]: {
        ...(prev[ruleId] || {}),
        [variable]: value,
      },
    }));
  };

  const handleRunAutomation = async (ruleId: string) => {
    if (!singleCard) return;
    const rule = automationRules.find(r => r.id === ruleId);
    if (!rule) return;
    const values = automationInputs[ruleId] || {};

    if (rule.userInputs && rule.userInputs.length > 0) {
      const missing = rule.userInputs.filter(
        inp => inp.required && (values[inp.variableName] === undefined || values[inp.variableName] === null || values[inp.variableName] === '')
      );
      if (missing.length > 0) {
        setAutomationError(t('preview.automationMissingInput'));
        setAutomationMessage(null);
        return;
      }
    }

    const inputs: Record<string, AutomationInputValue> = {};
    if (rule.userInputs) {
      rule.userInputs.forEach((inp) => {
        const raw = values[inp.variableName];
        if (raw === undefined || raw === null || raw === '') return;
        let val: any = raw;
        if (inp.inputType === 'NUMBER') val = Number(raw);
        if (inp.inputType === 'BOOLEAN') val = raw === true || raw === 'true';
        inputs[inp.variableName] = { inputType: inp.inputType, value: val };
      });
    }

    setRunningRuleId(ruleId);
    setAutomationError(null);
    setAutomationMessage(null);
    try {
      const res = await jiraApi.invokeManualRule(ruleId, singleCard.issueKey, { inputs });
      const statuses = Object.values(res.result || {});
      const success = statuses.every(s => s === 'SUCCESS');
      setAutomationMessage(success ? t('preview.automationSuccess') : t('preview.automationPartial', { count: statuses.length }));
    } catch (err: any) {
      setAutomationError(err.message || t('notification.loadError'));
    } finally {
      setRunningRuleId(null);
    }
  };

  const toggleAutomation = () => {
    if (!singleCard) return;
    const next = !showAutomation;
    setShowAutomation(next);
    setSelectedAutomationId(null);
    if (next && !automationLoaded && !automationLoading) {
      fetchAutomation();
    }
  };

  // Авто-загрузка автоматизаций при выделении одной задачи, чтобы знать выводить ли кнопку
  useEffect(() => {
    if (selectedCards.length === 1) {
      fetchAutomation();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCards.length, selectedCards.map(c => c.issueKey).join(',')]);

  const selectedAutomationRule = selectedAutomationId
    ? automationRules.find(r => r.id === selectedAutomationId) || null
    : null;

  // Загрузка типов задач при открытии диалога смены типа
  useEffect(() => {
    if (!showChangeTypeDialog || !firstCardForType) return;
    const projectKey = firstCardForType.issueKey.split('-')[0];
    setIssueTypesLoading(true);
    jiraApi.getProjectIssueTypes(projectKey)
      .then((types) => setIssueTypes(types))
      .catch(() => setIssueTypes([]))
      .finally(() => setIssueTypesLoading(false));
  }, [showChangeTypeDialog, firstCardForType?.issueKey]);

  const currentTypeForFilter = firstCardForType?.issue.issueType?.toLowerCase();
  const availableIssueTypes = issueTypes.filter(
    (type) => type.name.toLowerCase() !== currentTypeForFilter
  );

  const handleChangeIssueType = (typeId: string, typeName: string) => {
    if (!onChangeIssueType || !currentTypeForFilter) return;
    selectedCards.forEach((card) => {
      onChangeIssueType(
        card.taskId,
        card.issueKey,
        typeId,
        typeName,
        card.issue.issueType || ''
      );
    });
    setShowChangeTypeDialog(false);
    onClearSelection();
  };

  return (
    <>
      <div className="action-bar-overlay" onClick={onClearSelection} />
      <div className={`action-bar ${hasApplyBar ? 'with-apply-bar' : ''}`}>
        <div className="action-bar-header">
          <span className="action-bar-count" title={
            count === 1 ? `${singleCard?.issueKey} ${singleCard?.issue.summary || ''}`.trim() :
            count === 2 ? `${twoCards![0].issueKey} ${twoCards![0].issue.summary || ''} ↔ ${twoCards![1].issueKey} ${twoCards![1].issue.summary || ''}`.trim() :
            undefined
          }>
            {count === 1 ? (
              <>
                {singleCard?.issueKey}
                {singleCard?.issue.summary && (
                  <span className="action-bar-summary"> {singleCard.issue.summary}</span>
                )}
              </>
            ) : count === 2 ? (
              <>
                <span className="action-bar-task">
                  {twoCards![0].issueKey}
                  {twoCards![0].issue.summary && <span className="action-bar-summary"> {twoCards![0].issue.summary}</span>}
                </span>
                <span className="action-bar-sep"> ↔ </span>
                <span className="action-bar-task">
                  {twoCards![1].issueKey}
                  {twoCards![1].issue.summary && <span className="action-bar-summary"> {twoCards![1].issue.summary}</span>}
                </span>
              </>
            ) : (
              t('mindmap.selected', { count })
            )}
          </span>
          <button className="action-bar-close" onClick={onClearSelection} title={t('mindmap.close')} aria-label={t('mindmap.close')}><i className="lni lni-xmark" /></button>
        </div>

        <div className="action-bar-actions">
          {/* Блок: Добавить связь (первый) */}
          {count === 1 && onCreateLink && (
            <div className="action-group">
              <div className="action-dropdown">
                <button className="action-btn action-btn-compact" onClick={() => setShowLinkDialog(!showLinkDialog)} data-first>
                  <span className="action-icon"><i className="lni lni-plus" /></span>
                  <span className="action-label">{t('mindmap.addLink')}</span>
                </button>
                {showLinkDialog && (
                  <div className="action-link-dialog">
                    <div className="add-link-type">
                      <LinkTypeSelect value={selectedLinkType} onChange={setSelectedLinkType} />
                    </div>
                    {selectedLinkType !== 'Child' && (
                      <div className="add-link-direction">
                        <label><input type="radio" checked={isOutward} onChange={() => setIsOutward(true)} />{singleCard?.issueKey} → task</label>
                        <label><input type="radio" checked={!isOutward} onChange={() => setIsOutward(false)} />task → {singleCard?.issueKey}</label>
                      </div>
                    )}
                    <div className="add-link-input-group">
                      <input type="text" placeholder={t('mindmap.keyOrUrl')} value={linkInput} onChange={(e) => setLinkInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateLink()} />
                      <button onClick={handleCreateLink} disabled={!linkInput.trim()}>{t('mindmap.add')}</button>
                    </div>
                    {existingIssues && existingIssues.length > 0 && (
                      <div className="add-link-existing">
                        <div className="add-link-existing-header">{t('mindmap.orSelect')}</div>
                        <div className="add-link-existing-list">
                          {existingIssues.filter(i => i.key !== singleCard?.issueKey).slice(0, 5).map(i => (
                            <button key={i.key} className="add-link-existing-item" onClick={() => handleSelectExisting(i.key)}>
                              <span className="existing-key">{i.key}</span>
                              <span className="existing-summary">{i.summary.length > 25 ? i.summary.substring(0, 25) + '...' : i.summary}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Блок: Просмотр и навигация */}
          <div className="action-group">
            {hasNonRootCards && (
              <button className="action-btn action-btn-compact primary" onClick={handleOpenLinks} {...(!(count === 1 && onCreateLink) ? { 'data-first': true } : {})}>
                <span className="action-icon"><i className="lni lni-folder-1" /></span>
                <span className="action-label">{t('mindmap.openLinks')}</span>
              </button>
            )}
            <button className="action-btn action-btn-compact" onClick={handleOpenInJira} {...(!(count === 1 && onCreateLink) && !hasNonRootCards ? { 'data-first': true } : {})}>
              <span className="action-icon"><i className="lni lni-eye" /></span>
              <span className="action-label">{t('mindmap.openInJira')}</span>
            </button>
            {count === 1 && onLoadParentChain && (
              <button className="action-btn action-btn-compact" onClick={() => { onLoadParentChain(selectedCards[0].issueKey); onClearSelection(); }}>
                <span className="action-icon"><i className="lni lni-arrow-upward" /></span>
                <span className="action-label">{t('mindmap.loadParentChain')}</span>
              </button>
            )}
          </div>

          {/* Блок: Связи */}
          {(count === 2 && onCrossLink) || (canAddChild && onAddChild && twoCards) ? (
            <div className="action-group">
              {count === 2 && onCrossLink && (
            <div className="action-dropdown">
              <button className="action-btn action-btn-compact primary" onClick={() => setShowCrossLinkDialog(!showCrossLinkDialog)}>
                <span className="action-icon"><i className="lni lni-link-2-angular-right" /></span>
                <span className="action-label">{t('mindmap.linkTasks')}</span>
              </button>
              {showCrossLinkDialog && twoCards && (
                <div className="action-link-dialog cross-link-dialog">
                  <div className="cross-link-header">{t('mindmap.linkTasksTitle')}</div>
                  <div className="add-link-type">
                    <LinkTypeSelect value={selectedLinkType} onChange={setSelectedLinkType} childLabelKey="mindmap.subtaskChild" />
                  </div>
                  {selectedLinkType === 'Child' ? (
                    <div className="add-link-direction cross-link-direction parent-child-direction">
                      <div className="parent-child-hint">{t('mindmap.selectParent')}</div>
                      <label className={parentIndex === 0 ? 'selected' : ''}>
                        <input type="radio" checked={parentIndex === 0} onChange={() => setParentIndex(0)} />
                        <span className="direction-label">
                          <span className="direction-key parent-key"><i className="lni lni-user-4" aria-hidden /> {twoCards[0].issueKey}</span>
                          <span className="direction-arrow">→</span>
                          <span className="direction-key child-key"><i className="lni lni-paperclip-1" aria-hidden /> {twoCards[1].issueKey}</span>
                        </span>
                      </label>
                      <label className={parentIndex === 1 ? 'selected' : ''}>
                        <input type="radio" checked={parentIndex === 1} onChange={() => setParentIndex(1)} />
                        <span className="direction-label">
                          <span className="direction-key parent-key"><i className="lni lni-user-4" aria-hidden /> {twoCards[1].issueKey}</span>
                          <span className="direction-arrow">→</span>
                          <span className="direction-key child-key"><i className="lni lni-paperclip-1" aria-hidden /> {twoCards[0].issueKey}</span>
                        </span>
                      </label>
                    </div>
                  ) : (
                    <div className="add-link-direction cross-link-direction">
                      <label className={isOutward ? 'selected' : ''}>
                        <input type="radio" checked={isOutward} onChange={() => setIsOutward(true)} />
                        <span className="direction-label">
                          <span className="direction-key">{twoCards[0].issueKey}</span>
                          <span className="direction-arrow">→</span>
                          <span className="direction-key">{twoCards[1].issueKey}</span>
                        </span>
                      </label>
                      <label className={!isOutward ? 'selected' : ''}>
                        <input type="radio" checked={!isOutward} onChange={() => setIsOutward(false)} />
                        <span className="direction-label">
                          <span className="direction-key">{twoCards[1].issueKey}</span>
                          <span className="direction-arrow">→</span>
                          <span className="direction-key">{twoCards[0].issueKey}</span>
                        </span>
                      </label>
                    </div>
                  )}
                  <button className="cross-link-submit" onClick={handleCreateCrossLink}>
                    {selectedLinkType === 'Child' ? t('mindmap.makeSubtask') : t('mindmap.createLink')}
                  </button>
                </div>
              )}
            </div>
          )}

              {canAddChild && onAddChild && twoCards && (
                <div className="action-dropdown subtask-dropdown">
                  <button className="action-btn action-btn-compact primary" onClick={() => {
                  if (epicCard && nonEpicCard) { handleAddChild(); }
                  else { setSelectedLinkType('Child'); setShowCrossLinkDialog(true); }
                }}>
                  <span className="action-icon"><i className="lni lni-user-4" /></span>
                  <span className="action-label">{t('mindmap.toSubtask')}</span>
                </button>
              </div>
              )}
            </div>
          ) : null}

          {/* Блок: Автоматизация и Изменить тип */}
          {((count === 1 && automationRules.length > 0) || (allSameType && onChangeIssueType)) && (
            <div className="action-group">
              {count === 1 && automationRules.length > 0 && (
                <div className="action-dropdown">
                  <button className="action-btn action-btn-compact" onClick={toggleAutomation}>
                    <span className="action-icon"><i className="lni lni-bolt-2" /></span>
                    <span className="action-label">{t('preview.automationTitle')}</span>
                  </button>
                  {showAutomation && !selectedAutomationRule && (
                    <div className="action-link-dialog automation-dialog">
                      <div className="automation-header">
                        <div className="automation-title">{t('preview.automationTitle')}</div>
                        {automationLoading && <div className="automation-badge">{t('mindmap.loading')}</div>}
                      </div>

                      {automationError && (
                        <div className="automation-error">
                          <span>{automationError}</span>
                          <button className="automation-retry" onClick={fetchAutomation}>{t('tasksDashboard.retry')}</button>
                        </div>
                      )}

                      {!automationLoading && !automationError && automationRules.length === 0 && (
                        <div className="automation-empty">{t('preview.automationEmpty')}</div>
                      )}

                      {!automationLoading && automationRules.length > 0 && (
                        <div className="automation-card-list">
                          {automationRules.map((rule) => (
                            <div
                              key={rule.id}
                              className="automation-card"
                              role="button"
                              tabIndex={0}
                              onClick={() => { setSelectedAutomationId(rule.id); setShowAutomation(false); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedAutomationId(rule.id); setShowAutomation(false); } }}
                            >
                              <div className="automation-card-header">
                                <div className="automation-card-name">{rule.name}</div>
                                {rule.userInputs && rule.userInputs.length > 0 && (
                                  <span className="automation-icon" title={t('preview.automationHasInputs')}><i className="lni lni-gear-1" /></span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {automationMessage && <div className="automation-status success">{automationMessage}</div>}
                    </div>
                  )}
                </div>
              )}

              {allSameType && onChangeIssueType && (
                <div className="action-dropdown">
                  <button className="action-btn action-btn-compact" onClick={() => setShowChangeTypeDialog(!showChangeTypeDialog)}>
                    <span className="action-icon"><i className="lni lni-bookmark-1" /></span>
                    <span className="action-label">{t('mindmap.changeIssueType')}</span>
                  </button>
                  {showChangeTypeDialog && firstCardForType && (
                    <div className="action-link-dialog change-type-dialog">
                      <div className="add-link-type">{t('mindmap.changeIssueTypeTitle')}</div>
                      {issueTypesLoading ? (
                        <div className="change-type-loading">{t('mindmap.loading')}</div>
                      ) : availableIssueTypes.length === 0 ? (
                        <div className="change-type-empty">{t('mindmap.noOtherTypes')}</div>
                      ) : (
                        <div className="change-type-list">
                          {availableIssueTypes.map((type) => (
                            <button
                              key={type.id}
                              className="change-type-item"
                              onClick={() => handleChangeIssueType(type.id, type.name)}
                            >
                              {type.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}


          {/* Блок: Удаление */}
          {(hasNonRootCards || (count === 1 && singleCard?.nodeType !== 'root' && onDeleteIssue)) && (
            <div className="action-group">
              {hasNonRootCards && (
                <button className="action-btn action-btn-compact danger" onClick={handleDeleteLink}>
                  <span className="action-icon"><i className="lni lni-unlink-2-angular-eft" /></span>
                  <span className="action-label">{t('mindmap.deleteLinkAction')}</span>
                </button>
              )}
              {count === 1 && singleCard?.nodeType !== 'root' && onDeleteIssue && (
                <button className="action-btn action-btn-compact danger" onClick={handleDeleteIssue}>
                  <span className="action-icon"><i className="lni lni-trash-3" /></span>
                  <span className="action-label">{t('mindmap.deleteTaskAction')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedAutomationRule && createPortal(
        <div className="app automation-modal-overlay" onClick={() => setSelectedAutomationId(null)}>
          <div className="automation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="automation-modal-header">
              <div className="automation-modal-title">{t('preview.automationTitle')}</div>
              <button className="automation-modal-close" onClick={() => setSelectedAutomationId(null)} aria-label={t('profile.close')}>
                ×
              </button>
            </div>

            <div className="automation-modal-body profile-editor-form">
              <div className="form-group">
                <label>{t('preview.automationChoose')}</label>
                <select
                  value={selectedAutomationRule.id}
                  onChange={(e) => setSelectedAutomationId(e.target.value)}
                >
                  {automationRules.map(rule => (
                    <option key={rule.id} value={rule.id}>{rule.name}</option>
                  ))}
                </select>
              </div>

              {selectedAutomationRule.userInputs && selectedAutomationRule.userInputs.length > 0 ? (
                <>
                  {selectedAutomationRule.userInputs.map((input) => {
                    const val = (automationInputs[selectedAutomationRule.id] || {})[input.variableName] ?? '';

                    if (input.inputType === 'BOOLEAN') {
                      return (
                        <div key={input.variableName} className="form-group">
                          <label>
                            {input.displayName}{input.required && <span className="required">*</span>}
                          </label>
                          <select
                            value={String(val)}
                            onChange={(e) => handleAutomationInputChange(selectedAutomationRule.id, input.variableName, e.target.value === 'true')}
                          >
                            <option value="">{t('preview.automationSelect')}</option>
                            <option value="true">{t('common.yes')}</option>
                            <option value="false">{t('common.no')}</option>
                          </select>
                        </div>
                      );
                    }

                    if (input.inputType === 'NUMBER') {
                      return (
                        <div key={input.variableName} className="form-group">
                          <label>
                            {input.displayName}{input.required && <span className="required">*</span>}
                          </label>
                          <input
                            type="number"
                            value={val === '' ? '' : Number(val)}
                            onChange={(e) => handleAutomationInputChange(selectedAutomationRule.id, input.variableName, e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder={t('preview.automationInputPlaceholder')}
                          />
                        </div>
                      );
                    }

                    if (input.inputType === 'DROPDOWN' && Array.isArray(input.defaultValue)) {
                      return (
                        <div key={input.variableName} className="form-group">
                          <label>
                            {input.displayName}{input.required && <span className="required">*</span>}
                          </label>
                          <select
                            value={String(val)}
                            onChange={(e) => handleAutomationInputChange(selectedAutomationRule.id, input.variableName, e.target.value)}
                          >
                            <option value="">{t('preview.automationSelect')}</option>
                            {(input.defaultValue as string[]).map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      );
                    }

                    if (input.inputType === 'PARAGRAPH') {
                      return (
                        <div key={input.variableName} className="form-group">
                          <label>
                            {input.displayName}{input.required && <span className="required">*</span>}
                          </label>
                          <textarea
                            value={String(val)}
                            onChange={(e) => handleAutomationInputChange(selectedAutomationRule.id, input.variableName, e.target.value)}
                            placeholder={t('preview.automationInputPlaceholder')}
                          />
                        </div>
                      );
                    }

                    return (
                      <div key={input.variableName} className="form-group">
                        <label>
                          {input.displayName}{input.required && <span className="required">*</span>}
                        </label>
                        <input
                          type="text"
                          value={String(val)}
                          onChange={(e) => handleAutomationInputChange(selectedAutomationRule.id, input.variableName, e.target.value)}
                          placeholder={t('preview.automationInputPlaceholder')}
                        />
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="automation-empty">{t('preview.automationNoInputs') || 'Нет параметров'}</div>
              )}

              {automationError && <div className="automation-error">{automationError}</div>}
              {automationMessage && <div className="automation-status success">{automationMessage}</div>}
            </div>

            <div className="automation-modal-footer">
              <button className="automation-run" onClick={() => handleRunAutomation(selectedAutomationRule.id)} disabled={runningRuleId === selectedAutomationRule.id}>
                {runningRuleId === selectedAutomationRule.id ? t('preview.automationRunning') : t('preview.automationRun')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
