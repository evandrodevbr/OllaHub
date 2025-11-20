'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Clock, Play, Pause } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Task {
  id: string;
  label: string;
  cron_schedule: string;
  action: {
    type: 'search_and_summarize' | 'just_ping' | 'custom_prompt';
    query?: string;
    model?: string;
    max_results?: number;
    message?: string;
    prompt?: string;
  };
  enabled: boolean;
  last_run: string | null;
  created_at: string;
  updated_at: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  useEffect(() => {
    loadTasks();
  }, []);
  
  const loadTasks = async () => {
    try {
      setLoading(true);
      const loaded = await invoke<Task[]>('list_tasks');
      setTasks(loaded);
    } catch (error) {
      console.error('Erro ao carregar tasks:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const toggleTask = async (id: string, currentEnabled: boolean) => {
    try {
      await invoke('toggle_task', { id, enabled: !currentEnabled });
      await loadTasks();
    } catch (error) {
      console.error('Erro ao alternar task:', error);
    }
  };
  
  const deleteTask = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta task?')) {
      return;
    }
    
    try {
      await invoke('delete_task', { id });
      await loadTasks();
    } catch (error) {
      console.error('Erro ao excluir task:', error);
    }
  };
  
  const formatCron = (cron: string) => {
    // Formatação básica de cron para exibição
    const parts = cron.split(' ');
    if (parts.length === 5) {
      const [min, hour, day, month, weekday] = parts;
      if (min === '0' && hour !== '*' && day === '*' && month === '*' && weekday === '*') {
        return `Todo dia às ${hour}:00`;
      }
      if (min === '0' && hour === '8' && day === '*' && month === '*' && weekday === '*') {
        return 'Todo dia às 8:00';
      }
    }
    return cron;
  };
  
  const formatLastRun = (lastRun: string | null) => {
    if (!lastRun) return 'Nunca';
    try {
      const date = new Date(lastRun);
      return date.toLocaleString('pt-BR');
    } catch {
      return lastRun;
    }
  };
  
  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Tarefas Agendadas</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie tarefas que executam automaticamente em segundo plano
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nova Task
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar Nova Task</DialogTitle>
              <DialogDescription>
                Configure uma tarefa para executar automaticamente
              </DialogDescription>
            </DialogHeader>
            <TaskFormDialog 
              onSuccess={() => {
                setIsDialogOpen(false);
                loadTasks();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Carregando tasks...
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              Nenhuma task agendada ainda.
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeira Task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tasks.map(task => (
            <Card key={task.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {task.label}
                      {task.enabled ? (
                        <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded">
                          Ativa
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-500/10 text-gray-500 px-2 py-1 rounded">
                          Pausada
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatCron(task.cron_schedule)}
                        </span>
                        <span>Última execução: {formatLastRun(task.last_run)}</span>
                      </div>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`toggle-${task.id}`} className="text-sm">
                        {task.enabled ? 'Ativa' : 'Pausada'}
                      </Label>
                      <Switch
                        id={`toggle-${task.id}`}
                        checked={task.enabled}
                        onCheckedChange={() => toggleTask(task.id, task.enabled)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteTask(task.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  <p><strong>Tipo:</strong> {
                    task.action.type === 'search_and_summarize' ? 'Pesquisar e Resumir' :
                    task.action.type === 'just_ping' ? 'Notificação' :
                    'Prompt Customizado'
                  }</p>
                  {task.action.query && (
                    <p><strong>Query:</strong> {task.action.query}</p>
                  )}
                  {task.action.model && (
                    <p><strong>Modelo:</strong> {task.action.model}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskFormDialog({ onSuccess }: { onSuccess: () => void }) {
  const [label, setLabel] = useState('');
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly' | 'custom'>('daily');
  const [hour, setHour] = useState('8');
  const [minute, setMinute] = useState('0');
  const [customCron, setCustomCron] = useState('');
  const [taskType, setTaskType] = useState<'search_and_summarize' | 'just_ping' | 'custom_prompt'>('search_and_summarize');
  const [query, setQuery] = useState('');
  const [model, setModel] = useState('llama3.2');
  const [maxResults, setMaxResults] = useState(3);
  const [message, setMessage] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const generateCron = (): string => {
    if (scheduleType === 'custom') {
      return customCron;
    }
    // Diário às hora:minuto
    return `${minute} ${hour} * * *`;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      let action: any;
      
      if (taskType === 'search_and_summarize') {
        action = {
          type: 'search_and_summarize',
          query,
          model,
          max_results: maxResults,
        };
      } else if (taskType === 'just_ping') {
        action = {
          type: 'just_ping',
          message,
        };
      } else {
        action = {
          type: 'custom_prompt',
          prompt: customPrompt,
          model,
        };
      }
      
      await invoke('create_task', {
        label,
        cronSchedule: generateCron(),
        action,
      });
      
      onSuccess();
    } catch (error) {
      console.error('Erro ao criar task:', error);
      alert('Erro ao criar task. Verifique o console para mais detalhes.');
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="label">Nome da Task</Label>
        <Input
          id="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex: Resumo de Notícias Diário"
          required
        />
      </div>
      
      <div>
        <Label htmlFor="schedule-type">Frequência</Label>
        <Select value={scheduleType} onValueChange={(v: any) => setScheduleType(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Diário</SelectItem>
            <SelectItem value="weekly">Semanal</SelectItem>
            <SelectItem value="custom">Cron Customizado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {scheduleType === 'custom' ? (
        <div>
          <Label htmlFor="cron">Expressão Cron</Label>
          <Input
            id="cron"
            value={customCron}
            onChange={(e) => setCustomCron(e.target.value)}
            placeholder="0 8 * * * (todo dia às 8h)"
            required
          />
          <p className="text-xs text-muted-foreground mt-1">
            Formato: minuto hora dia mês dia-da-semana
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="hour">Hora</Label>
            <Input
              id="hour"
              type="number"
              min="0"
              max="23"
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="minute">Minuto</Label>
            <Input
              id="minute"
              type="number"
              min="0"
              max="59"
              value={minute}
              onChange={(e) => setMinute(e.target.value)}
              required
            />
          </div>
        </div>
      )}
      
      <div>
        <Label htmlFor="task-type">Tipo de Task</Label>
        <Select value={taskType} onValueChange={(v: any) => setTaskType(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="search_and_summarize">Pesquisar e Resumir</SelectItem>
            <SelectItem value="just_ping">Apenas Notificação</SelectItem>
            <SelectItem value="custom_prompt">Prompt Customizado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {taskType === 'search_and_summarize' && (
        <>
          <div>
            <Label htmlFor="query">Query de Pesquisa</Label>
            <Input
              id="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: notícias sobre inteligência artificial hoje"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="model">Modelo</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="llama3.2"
                required
              />
            </div>
            <div>
              <Label htmlFor="max-results">Máx. Resultados</Label>
              <Input
                id="max-results"
                type="number"
                min="1"
                max="10"
                value={maxResults}
                onChange={(e) => setMaxResults(parseInt(e.target.value))}
                required
              />
            </div>
          </div>
        </>
      )}
      
      {taskType === 'just_ping' && (
        <div>
          <Label htmlFor="message">Mensagem</Label>
          <Textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Mensagem da notificação"
            required
          />
        </div>
      )}
      
      {taskType === 'custom_prompt' && (
        <>
          <div>
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Seu prompt customizado aqui"
              required
              className="min-h-[100px]"
            />
          </div>
          <div>
            <Label htmlFor="model-prompt">Modelo</Label>
            <Input
              id="model-prompt"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="llama3.2"
              required
            />
          </div>
        </>
      )}
      
      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Criando...' : 'Criar Task'}
        </Button>
      </div>
    </form>
  );
}

