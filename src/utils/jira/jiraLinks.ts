import { JiraApiClient } from './jiraRequest';

JiraApiClient.prototype.getLinkTypes = async function () {
  try {
    const data = await this.request<{ issueLinkTypes: any[] }>('/issueLinkType');
    return data.issueLinkTypes.map((t: any) => ({
      id: t.id,
      name: t.name,
      inward: t.inward,
      outward: t.outward,
    }));
  } catch (error) {
    return [];
  }
};

JiraApiClient.prototype.createIssueLink = async function (outwardIssueKey, inwardIssueKey, linkTypeName) {
  try {
    await this.request('/issueLink', {
      method: 'POST',
      data: {
        type: { name: linkTypeName },
        outwardIssue: { key: outwardIssueKey },
        inwardIssue: { key: inwardIssueKey },
      },
    });
    return true;
  } catch (error) {
    return false;
  }
};

JiraApiClient.prototype.deleteIssueLink = async function (linkId) {
  try {
    await this.request(`/issueLink/${linkId}`, { method: 'DELETE' });
    return true;
  } catch (error) {
    return false;
  }
};

JiraApiClient.prototype.deleteIssue = async function (issueKey, deleteSubtasks) {
  if (deleteSubtasks === undefined) deleteSubtasks = true;
  try {
    const endpoint = `/issue/${issueKey}?deleteSubtasks=${deleteSubtasks}`;
    await this.request(endpoint, { method: 'DELETE' });
    return { success: true };
  } catch (error: any) {
    const details = error.response?.data?.details || error.response?.data?.errorMessages?.[0] || error.message;
    
    if (error.response?.status === 400) {
      return { success: false, error: 'Нет прав на удаление или задача имеет зависимости' };
    }
    if (error.response?.status === 403) {
      return { success: false, error: 'Нет прав на удаление этой задачи' };
    }
    if (error.response?.status === 404) {
      return { success: false, error: 'Задача не найдена' };
    }
    
    return { success: false, error: details || 'Неизвестная ошибка' };
  }
};

JiraApiClient.prototype.changeLinkType = async function (sourceKey, targetKey, oldLinkId, newLinkTypeName, oldLinkTypeName) {
  try {
    if (!oldLinkId.startsWith('subtask-') && !oldLinkId.startsWith('parent-')) {
      const deleteSuccess = await this.deleteIssueLink(oldLinkId);
      if (!deleteSuccess) {
        return false;
      }
    }
    
    const createSuccess = await this.createIssueLink(sourceKey, targetKey, newLinkTypeName);
    
    if (!createSuccess) {
      if (!oldLinkId.startsWith('subtask-') && !oldLinkId.startsWith('parent-') && oldLinkTypeName) {
        const rollbackSuccess = await this.createIssueLink(sourceKey, targetKey, oldLinkTypeName);
        if (rollbackSuccess) {
        } else {
        }
      }
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
};

JiraApiClient.prototype.getProjectIssueTypes = async function (projectKey) {
  try {
    const project = await this.request<any>(`/project/${projectKey}`);
    return project.issueTypes?.map((t: any) => ({
      id: t.id,
      name: t.name,
      subtask: t.subtask || false,
    })) || [];
  } catch (error) {
    return [];
  }
};

JiraApiClient.prototype.changeIssueType = async function (issueKey: string, issueTypeId: string) {
  try {
    await this.request(`/issue/${issueKey}`, {
      method: 'PUT',
      data: {
        fields: {
          issuetype: { id: issueTypeId },
        },
      },
    });
    return { success: true };
  } catch (error: any) {
    const details = error.response?.data?.errorMessages?.[0] || error.response?.data?.errors?.issuetype || error.message;
    return { success: false, error: details || 'Неизвестная ошибка' };
  }
};

JiraApiClient.prototype.convertSubtaskToLink = async function (parentKey, subtaskKey, linkTypeName) {
  if (!linkTypeName) linkTypeName = 'Relates';
  const projectKey = subtaskKey.split('-')[0];
  
  const issueTypes = await this.getProjectIssueTypes(projectKey);
  const taskType = issueTypes.find((t: any) => t.name.toLowerCase() === 'task' && !t.subtask);
  const subtaskType = issueTypes.find((t: any) => t.subtask);
  
  if (!taskType) {
    return { success: false, error: 'Не найден тип Task в проекте' };
  }
  
  let convertedToTask = false;

  try {
    await this.request(`/issue/${subtaskKey}`, {
      method: 'PUT',
      data: {
        fields: {
          issuetype: { id: taskType.id },
          parent: null,
        },
      },
    });
    
    convertedToTask = true;
    const linkCreated = await this.createIssueLink(parentKey, subtaskKey, linkTypeName);
    
    if (!linkCreated) {
      if (subtaskType) {
        try {
          await this.request(`/issue/${subtaskKey}`, {
            method: 'PUT',
            data: {
              fields: {
                issuetype: { id: subtaskType.id },
                parent: { key: parentKey },
              },
            },
          });
        } catch (rollbackError) {
        }
      }
      
      return { success: false, error: 'Не удалось создать связь. Изменения отменены.' };
    }
    
    return { success: true };
  } catch (error: any) {
    if (convertedToTask && subtaskType) {
      try {
        await this.request(`/issue/${subtaskKey}`, {
          method: 'PUT',
          data: {
            fields: {
              issuetype: { id: subtaskType.id },
              parent: { key: parentKey },
            },
          },
        });
      } catch (rollbackError) {
      }
    }
    
    const details = error.response?.data?.errorMessages?.[0] || error.message;
    return { success: false, error: details || 'Ошибка конвертации' };
  }
};

JiraApiClient.prototype.getEpicLinkFieldId = async function () {
  if (this.epicLinkFieldIdCache !== undefined) {
    return this.epicLinkFieldIdCache;
  }
  
  try {
    const fields = await this.request<any[]>('/field');
    
    const epicLinkField = fields.find((f: any) => 
      f.name?.toLowerCase() === 'epic link' ||
      f.key?.toLowerCase() === 'epic link' ||
      (f.schema?.custom && f.schema.customId && f.name?.toLowerCase().includes('epic link'))
    );
    
    if (epicLinkField) {
      this.epicLinkFieldIdCache = epicLinkField.key;
      return epicLinkField.key;
    }
    
    const parentEpicField = fields.find((f: any) => 
      f.name?.toLowerCase() === 'parent epic' ||
      f.name?.toLowerCase().includes('эпик') ||
      (f.schema?.custom && f.name?.toLowerCase().includes('epic'))
    );
    
    if (parentEpicField) {
      this.epicLinkFieldIdCache = parentEpicField.key;
      return parentEpicField.key;
    }
    this.epicLinkFieldIdCache = null;
    return null;
  } catch (error) {
    this.epicLinkFieldIdCache = null;
    return null;
  }
};

JiraApiClient.prototype.convertLinkToSubtask = async function (parentKey, issueKey, linkId, linkTypeName) {
  let linkDeleted = false;
  
  const restoreLink = async () => {
    if (linkDeleted && linkTypeName && !linkId.startsWith('subtask-') && !linkId.startsWith('parent-')) {
      try {
        const restored = await this.createIssueLink(parentKey, issueKey, linkTypeName);
        if (restored) {
        } else {
        }
      } catch (rollbackError) {
      }
    }
  };
  
  try {
    const [parentIssue, childIssue] = await Promise.all([
      this.getIssue(parentKey),
      this.getIssue(issueKey),
    ]);
    
    const parentType = parentIssue.issueType?.toLowerCase() || '';
    const childType = childIssue.issueType?.toLowerCase() || '';
    if (childType.includes('epic') || childType.includes('эпик')) {
      return { 
        success: false, 
        error: `Epic (${issueKey}) не может быть дочерней задачей` 
      };
    }
    
    if (childType.includes('sub-task') || childType.includes('subtask') || childType.includes('подзадача')) {
      return { 
        success: false, 
        error: `${issueKey} уже является Sub-task. Сначала конвертируйте в обычную задачу.` 
      };
    }
    
    const isParentEpic = parentType.includes('epic') || parentType.includes('эпик');
    
    if (!isParentEpic) {
      const epicLinkFieldId = await this.getEpicLinkFieldId();
      if (!epicLinkFieldId || epicLinkFieldId === 'parent') {
        return { 
          success: false, 
          error: `Родитель ${parentKey} должен быть Epic для добавления дочерних задач. Текущий тип: ${parentIssue.issueType}` 
        };
      }
    }
    
    if (!linkId.startsWith('subtask-') && !linkId.startsWith('parent-')) {
      const deleteSuccess = await this.deleteIssueLink(linkId);
      if (deleteSuccess) {
        linkDeleted = true;
      } else {
        return { success: false, error: 'Не удалось удалить существующую связь' };
      }
    }
    
    if (isParentEpic) {
      try {
        await this.request(`/issue/${issueKey}`, {
          method: 'PUT',
          data: {
            fields: {
              parent: { key: parentKey },
            },
          },
        });
        return { success: true };
      } catch (parentError: any) {
        const errorDetails = parentError.response?.data?.details || parentError.response?.data;
        const epicLinkFieldId = await this.getEpicLinkFieldId();
        
        if (epicLinkFieldId && epicLinkFieldId !== 'parent') {
          try {
            await this.request(`/issue/${issueKey}`, {
              method: 'PUT',
              data: {
                fields: {
                  [epicLinkFieldId]: parentKey,
                },
              },
            });
            return { success: true };
          } catch (epicLinkError: any) {
            await restoreLink();
            
            const errorDetails2 = epicLinkError.response?.data?.details || epicLinkError.response?.data;
            throw epicLinkError;
          }
        }
        
        await restoreLink();
        throw parentError;
      }
    } else {
      const epicLinkFieldId = await this.getEpicLinkFieldId();
      
      if (epicLinkFieldId && epicLinkFieldId !== 'parent') {
        try {
          await this.request(`/issue/${issueKey}`, {
            method: 'PUT',
            data: {
              fields: {
                [epicLinkFieldId]: parentKey,
              },
            },
          });
          return { success: true };
        } catch (epicLinkError: any) {
          await restoreLink();
          
          const errorDetails = epicLinkError.response?.data?.details || epicLinkError.response?.data;
          return { 
            success: false, 
            error: `Не удалось установить Epic Link. Связь восстановлена.` 
          };
        }
      }
      
      await restoreLink();
      return { 
        success: false, 
        error: `Родитель ${parentKey} должен быть Epic для добавления дочерних задач. Текущий тип: ${parentIssue.issueType}` 
      };
    }
  } catch (error: any) {
    await restoreLink();
    
    const responseData = error.response?.data;
    const jiraError = responseData?.details || responseData;
    let errorMsg = '';
    if (jiraError?.errorMessages?.length > 0) {
      errorMsg = jiraError.errorMessages[0];
    } else if (jiraError?.errors) {
      const fieldErrors = Object.entries(jiraError.errors)
        .filter(([_, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
      errorMsg = fieldErrors || '';
    } else if (jiraError?.message) {
      errorMsg = jiraError.message;
    } else if (responseData?.error) {
      errorMsg = responseData.error;
    } else {
      errorMsg = error.message;
    }
    
    const rollbackNote = linkDeleted && linkTypeName ? ' Связь восстановлена.' : '';
    return { success: false, error: (errorMsg || 'Ошибка установки parent/Epic Link') + rollbackNote };
  }
};

JiraApiClient.prototype.addChildToEpic = async function (epicKey, childKey) {
  try {
    try {
      await this.request(`/issue/${childKey}`, {
        method: 'PUT',
        data: {
          fields: {
            parent: { key: epicKey },
          },
        },
      });
      return { success: true };
    } catch (parentError: any) {
      const epicLinkFieldId = await this.getEpicLinkFieldId();
      
      if (epicLinkFieldId && epicLinkFieldId !== 'parent') {
        await this.request(`/issue/${childKey}`, {
          method: 'PUT',
          data: {
            fields: {
              [epicLinkFieldId]: epicKey,
            },
          },
        });
        return { success: true };
      }
      
      throw parentError;
    }
  } catch (error: any) {
    const responseData = error.response?.data;
    let errorMsg = '';
    
    if (responseData?.errorMessages?.length > 0) {
      errorMsg = responseData.errorMessages[0];
    } else if (responseData?.errors) {
      const fieldErrors = Object.entries(responseData.errors)
        .filter(([_, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
      errorMsg = fieldErrors || '';
    } else if (responseData?.message) {
      errorMsg = responseData.message;
    } else {
      errorMsg = error.message;
    }
    
    return { success: false, error: errorMsg || 'Ошибка добавления child' };
  }
};

JiraApiClient.prototype.removeParent = async function (issueKey) {
  try {
    await this.request(`/issue/${issueKey}`, {
      method: 'PUT',
      data: {
        fields: {
          parent: null,
        },
      },
    });
    return { success: true };
  } catch (error: any) {
    const responseData = error.response?.data;
    let errorMsg = '';
    
    if (responseData?.errorMessages?.length > 0) {
      errorMsg = responseData.errorMessages[0];
    } else if (responseData?.errors) {
      const fieldErrors = Object.values(responseData.errors).filter(Boolean);
      errorMsg = fieldErrors.join('; ') as string;
    } else if (responseData?.message) {
      errorMsg = responseData.message;
    } else {
      errorMsg = error.message;
    }
    
    return { success: false, error: errorMsg || 'Ошибка удаления parent' };
  }
};
