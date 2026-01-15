export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 py-4 px-4 md:px-8">
      <div className="text-center text-sm text-slate-600 dark:text-slate-400">
        <p>
          &copy; {currentYear} Brought to you by{' '}
          <span className="text-red-600 dark:text-red-400 font-semibold">Real Star Security</span>
        </p>
      </div>
    </footer>
  );
}
