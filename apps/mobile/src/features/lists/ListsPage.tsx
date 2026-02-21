import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../app/store'
import { selectTheme, themeToggled } from '../../app/appSlice'
import {
  selectAllLists,
  selectListCount,
  selectTotalItemCount,
} from './listsSlice'
import { ListsHeader } from './ListsHeader'
import { SummaryChips } from './SummaryChips'
import { ListTile } from './ListTile'

export function ListsPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const lists = useAppSelector(selectAllLists)
  const listCount = useAppSelector(selectListCount)
  const totalItemCount = useAppSelector(selectTotalItemCount)
  const theme = useAppSelector(selectTheme)

  const handleThemeToggle = () => {
    dispatch(themeToggled())
  }

  return (
    <div className="min-h-screen pb-[100px]">
      <ListsHeader
        title="Meine Listen"
        theme={theme}
        onThemeToggle={handleThemeToggle}
        onAdd={() => void navigate({ to: '/lists/new' })}
      />
      <SummaryChips listCount={listCount} itemCount={totalItemCount} memberCount={0} />
      <div className="grid grid-cols-2 gap-3 px-5">
        {lists.map((list) => (
          <ListTile
            key={list.id}
            list={list}
            onClick={() => void navigate({ to: '/lists/$listId', params: { listId: list.id } })}
            onEdit={() => {}}
          />
        ))}
      </div>
    </div>
  )
}
