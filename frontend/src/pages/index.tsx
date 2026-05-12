import Head from "next/head";
import { BankrollBar } from "@/components/shared/BankrollBar";
import { OpportunityList } from "@/components/dashboard/OpportunityList";

export default function Home() {
  return (
    <>
      <Head>
        <title>Card Arbitrage — Best Opportunities</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="min-h-screen flex flex-col">
        <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Card Arbitrage</h1>
            <p className="text-xs text-gray-400">Graded Pokémon Deal Finder</p>
          </div>
          <nav className="flex gap-3 text-sm">
            <a href="/" className="font-medium text-blue-600">Opportunities</a>
            <a href="/purchases" className="text-gray-500 hover:text-gray-900">Purchases</a>
          </nav>
        </header>
        <BankrollBar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Best Opportunities</h2>
            <p className="text-xs text-gray-400">Refreshes every 60s</p>
          </div>
          <OpportunityList />
        </main>
      </div>
    </>
  );
}
