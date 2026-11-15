import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, requestPersistence } from './db'
import { FoodTab } from './FoodTab'
import { LiftTab } from './LiftTab'
import { MoreTab } from './MoreTab'
import { Onboarding } from './Onboarding'
import { WeightTab } from './WeightTab'

type Tab = 'food' | 'lift' | 'weight' | 'more'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'food', label: 'Food', icon: '🍽' },
  { id: 'lift', label: 'Lift', icon: '🏋️' },
  { id: 'weight', label: 'Weight', icon: '⚖️' },
  { id: 'more', label: 'More', icon: '⚙️' },
]

export default function App() {
  // undefined = still loading, null = no profile yet
  const profile = useLiveQuery(async () => (await db.profile.get(1)) ?? null)
  const [tab, setTab] = useState<Tab>('food')

  useEffect(() => {
    requestPersistence()
  }, [])

  if (profile === undefined) return null
  if (profile === null) return <Onboarding onDone={() => setTab('food')} />

  return (
    <div className="app">
      <main>
        {tab === 'food' && <FoodTab profile={profile} />}
        {tab === 'lift' && <LiftTab profile={profile} />}
        {tab === 'weight' && <WeightTab profile={profile} />}
        {tab === 'more' && <MoreTab profile={profile} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
