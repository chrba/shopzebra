import { useNavigate } from '@tanstack/react-router'
import { useAppSelector } from '../../app/store'
import {
  selectAllLists,
  selectListCount,
  selectTotalItemCount,
} from './listsSlice'
import { ListsHeader } from './ListsHeader'
import { SummaryChips } from './SummaryChips'
import { ListTile } from './ListTile'
import { Card } from '@/components/ui/card'

export function ListsPage() {
  const navigate = useNavigate()
  const lists = useAppSelector(selectAllLists)
  const listCount = useAppSelector(selectListCount)
  const totalItemCount = useAppSelector(selectTotalItemCount)

  const goToCreateList = () => navigate({ to: '/lists/new' })

  return (
    <div className="min-h-screen pb-[100px]">
      <ListsHeader title="Meine Listen" onAdd={goToCreateList} />
      <SummaryChips
        listCount={listCount}
        itemCount={totalItemCount}
        memberCount={0}
      />
      <div className="grid grid-cols-2 gap-3 px-5">
        {lists.map((list) => (
          <ListTile
            key={list.id}
            list={list}
            onClick={() => {}}
            onEdit={() => {}}
          />
        ))}
        <Card
          className="hover:border-teal hover:bg-teal/5 min-h-[180px] cursor-pointer items-center justify-center gap-2 border-dashed bg-transparent"
          role="button"
          tabIndex={0}
          onClick={goToCreateList}
        >
          <div className="bg-secondary border-border flex size-12 items-center justify-center rounded-full border">
            <svg viewBox="0 0 24 24" className="fill-teal size-6">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </div>
          <span className="text-muted-foreground text-[13px] font-semibold">
            Neue Liste
          </span>
        </Card>
      </div>
    </div>
  )
}
