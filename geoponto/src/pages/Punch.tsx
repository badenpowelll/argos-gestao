import PunchClock from "@/components/PunchClock";

const PunchPage = () => {
  return (
    <div className="min-h-screen pb-8">
      <div className="border-b bg-card px-4 py-4">
        <h1 className="text-lg font-bold text-card-foreground">Registrar Ponto</h1>
        <p className="text-xs text-muted-foreground">Foto com verificação de enquadramento + Geolocalização</p>
      </div>
      <PunchClock />
    </div>
  );
};

export default PunchPage;
