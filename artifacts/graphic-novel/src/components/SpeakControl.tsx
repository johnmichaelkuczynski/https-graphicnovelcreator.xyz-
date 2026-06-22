import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Panel } from '@/lib/db';
import { fetchVoices, generateSpeech } from '@/lib/tts-client';
import { useSavePanel } from '@/hooks/use-novel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Mic, Loader2, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function SpeakControl({ panel }: { panel: Panel }) {
  const savePanel = useSavePanel();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [voiceId, setVoiceId] = useState(panel.voiceId ?? '');
  const [text, setText] = useState(panel.caption);
  const [generating, setGenerating] = useState(false);

  // Re-sync the editable text and voice from the panel each time the popover
  // opens, so the default always reflects the latest caption / saved voice.
  useEffect(() => {
    if (open) {
      setText(panel.caption);
      setVoiceId(panel.voiceId ?? '');
    }
  }, [open, panel.caption, panel.voiceId]);

  const voicesQuery = useQuery({
    queryKey: ['voices'],
    queryFn: fetchVoices,
    enabled: open,
    staleTime: 1000 * 60 * 30,
  });

  // Default to the first available voice once the list loads.
  const voices = voicesQuery.data ?? [];
  const effectiveVoiceId = voiceId || voices[0]?.voiceId || '';

  const handleGenerate = async () => {
    const spoken = text.trim();
    if (!spoken) {
      toast({ title: 'Nothing to say', description: 'Add some words for the character to speak.', variant: 'destructive' });
      return;
    }
    if (!effectiveVoiceId) {
      toast({ title: 'Pick a voice', description: 'Choose a voice for this character.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const blob = await generateSpeech(spoken, effectiveVoiceId);
      const voiceName = voices.find(v => v.voiceId === effectiveVoiceId)?.name ?? 'voice';
      savePanel.mutate({
        ...panel,
        audioBlob: blob,
        audioName: `${voiceName} (speech).mp3`,
        voiceId: effectiveVoiceId,
      });
      toast({ title: 'Voice added', description: `This panel now speaks in ${voiceName}.` });
      setOpen(false);
    } catch (err) {
      toast({
        title: 'Speech failed',
        description: err instanceof Error ? err.message : 'Could not generate speech.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 hover:bg-accent hover:text-accent-foreground text-muted-foreground"
          title="Make the character speak (ElevenLabs voice)"
        >
          <Mic className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 border-4 border-border brutal-shadow p-4"
      >
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
              <Volume2 className="w-4 h-4" /> Character Speech
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pick a voice and the words to speak. The generated voice becomes this panel's audio.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Voice</label>
            <Select value={effectiveVoiceId} onValueChange={setVoiceId} disabled={voicesQuery.isLoading}>
              <SelectTrigger className="border-2 border-border">
                <SelectValue placeholder={voicesQuery.isLoading ? 'Loading voices…' : 'Choose a voice'} />
              </SelectTrigger>
              <SelectContent>
                {voices.map(v => (
                  <SelectItem key={v.voiceId} value={v.voiceId}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {voicesQuery.isError && (
              <p className="text-[11px] text-destructive">
                {voicesQuery.error instanceof Error ? voicesQuery.error.message : 'Could not load voices.'}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Words to speak</label>
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={3}
              placeholder="What the character says…"
              className="resize-none border-2 border-border text-sm"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating || voicesQuery.isLoading}
            className="font-bold border-2 border-border brutal-shadow-sm"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><Mic className="w-4 h-4 mr-2" /> Generate Speech</>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
