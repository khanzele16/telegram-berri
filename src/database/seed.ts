import Category from '../database/models/Category';

const initialCategories = [
  { name: 'Одежда', emoji: '🧥', order: 1, description: 'Мужская и женская одежда' },
  { name: 'Еда и продукты', emoji: '🍔', order: 2, description: 'Продукты питания' },
  { name: 'Электроника', emoji: '📱', order: 3, description: 'Телефоны, компьютеры, аксессуары' },
  { name: 'Для дома', emoji: '🏠', order: 4, description: 'Мебель, декор, посуда' },
  { name: 'Красота и уход', emoji: '💄', order: 5, description: 'Косметика и парфюмерия' },
  { name: 'Спорт и отдых', emoji: '⚽', order: 6, description: 'Спортивные товары' },
  { name: 'Игрушки и хобби', emoji: '🎮', order: 7, description: 'Игрушки и товары для хобби' },
  { name: 'Книги', emoji: '📚', order: 8, description: 'Книги всех жанров' },
  { name: 'Автотовары', emoji: '🚗', order: 9, description: 'Автозапчасти и аксессуары' },
  { name: 'Услуги', emoji: '🛠️', order: 10, description: 'Различные услуги' }
];

export async function initializeCategories() {
  try {
    const count = await Category.countDocuments();
    if (count === 0) {
      await Category.insertMany(initialCategories);
      console.log('✅ Категории инициализированы');
    } else {
      console.log('ℹ️ Категории уже существуют');
    }
  } catch (error) {
    console.error('❌ Ошибка инициализации категорий:', error);
  }
}
