import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const MOODS = [
  { score: 1, emoji: "😞", label: "Muito insatisfeito" },
  { score: 2, emoji: "😟", label: "Insatisfeito" },
  { score: 3, emoji: "😐", label: "Neutro" },
  { score: 4, emoji: "🙂", label: "Satisfeito" },
  { score: 5, emoji: "😄", label: "Muito satisfeito" },
];

interface MoodPickerProps {
  onSelect: (score: number) => void;
  loading?: boolean;
}

const MoodPicker = ({ onSelect, loading }: MoodPickerProps) => {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-4 rounded-xl border bg-card p-6"
    >
      <p className="text-sm font-semibold text-card-foreground">
        Como você está se sentindo? (NR-01)
      </p>
      <p className="text-xs text-muted-foreground text-center">
        Avaliação de bem-estar emocional no trabalho
      </p>
      <div className="flex gap-3">
        {MOODS.map((mood) => (
          <button
            key={mood.score}
            onClick={() => setSelected(mood.score)}
            className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-all ${
              selected === mood.score
                ? "scale-110 bg-primary/10 ring-2 ring-primary"
                : "hover:bg-muted"
            }`}
          >
            <span className="text-3xl">{mood.emoji}</span>
            <span className="text-[10px] text-muted-foreground">{mood.score}</span>
          </button>
        ))}
      </div>
      {selected && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <p className="text-xs text-muted-foreground mb-2">
            {MOODS.find((m) => m.score === selected)?.label}
          </p>
          <Button
            onClick={() => onSelect(selected)}
            disabled={loading}
            className="rounded-lg px-8"
          >
            {loading ? "Registrando..." : "Confirmar"}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
};

export default MoodPicker;
