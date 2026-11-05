import React, { useEffect, useRef, useState, useCallback } from 'react';
import Lenis from 'lenis';

interface TableRowData {
  id: string;
  c1: string;
  c2: string;
  c3: string;
  c4?: string;
  c4Class?: string;
  c3Class?: string;
  isInteractive?: boolean;
}

interface IndustryData {
  name: string;
  btnNormal: string;
  btnConflict: string;
  sheet1: {
    filename: string;
    formula: string;
    tabLabel: string;
    subtext: string;
    headers: [string, string, string, string];
    rows: TableRowData[];
  };
  sheet2: {
    filename: string;
    formula: string;
    tabLabel: string;
    subtext: string;
    headers: [string, string, string];
    rows: TableRowData[];
  };
  tg: {
    botSubtitle: string;
    defaultMsg: string;
    syncingMsg: string;
    syncedFormula1: string;
    syncedFormula2: string;
    syncedSaleQty: string;
    syncedSaleStatus: string;
    syncedStockCount: string;
    syncedStockStatus: string;
    syncedTgMsg: string;
    conflictStatusSale: string;
    conflictSaleTag: string;
    conflictStatusStock: string;
    conflictStockTag: string;
    conflictPrompt: string;
    opt1Btn: string;
    opt2Btn: string;
    resolve1Formula1: string;
    resolve1Formula2: string;
    resolve1SaleQty: string;
    resolve1SaleStatus: string;
    resolve1StockCount: string;
    resolve1StockStatus: string;
    resolve1Title: string;
    resolve1Desc: string;
    resolve2Formula1: string;
    resolve2Formula2: string;
    resolve2SaleQty: string;
    resolve2SaleStatus: string;
    resolve2StockCount: string;
    resolve2StockStatus: string;
    resolve2Title: string;
    resolve2Desc: string;
  };
}

const INDUSTRIES: Record<'retail' | 'edu' | 'ops', IndustryData> = {
  retail: {
    name: 'Bán Hàng & Kho Vận',
    btnNormal: 'Tình huống 1: Khách đặt đơn mới',
    btnConflict: 'Tình huống 2: Sửa trùng nhau',
    sheet1: {
      filename: 'Don_Hang_Online_T11.xlsx',
      formula: '="ĐÃ DUYỆT (5 ÁO)"',
      tabLabel: 'Sheet 1: Bán Hàng',
      subtext: 'Bảng nguồn (Team Kinh Doanh)',
      headers: ['A (Mã Đơn)', 'B (Sản Phẩm)', 'C (SL)', 'D (Trạng Thái)'],
      rows: [
        { id: '1', c1: '#DH-101', c2: 'Váy Hoa Nhí', c3: '1', c4: 'ĐÃ GIAO', c4Class: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
        { id: '2', c1: '#DH-102', c2: 'Sơ Mi Lụa', c3: '2', c4: 'ĐÃ GIAO', c4Class: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
        { id: '3', c1: '#DH-103', c2: 'Áo Polo Kem (Size L)', c3: '5', c4: 'CHỜ XÁC NHẬN', c4Class: 'text-amber-700 dark:text-amber-400 font-bold', isInteractive: true },
      ],
    },
    sheet2: {
      filename: 'Quan_Ly_Kho_HN.xlsx',
      formula: '=100',
      tabLabel: 'Sheet 1: Tồn Kho',
      subtext: 'Bảng đích (Thủ Kho)',
      headers: ['A (Mã SP)', 'B (Tồn Kho)', 'C (Trạng Thái)'],
      rows: [
        { id: '1', c1: 'VAY-HOA', c2: '34 chiếc', c3: 'CÒN HÀNG', c3Class: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
        { id: '2', c1: 'SM-LUA', c2: '18 chiếc', c3: 'CÒN HÀNG', c3Class: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
        { id: '3', c1: 'POLO-KEM', c2: '100 chiếc', c3: 'KHỚP VỚI SALE', c3Class: 'text-emerald-700 dark:text-emerald-400 font-bold', isInteractive: true },
      ],
    },
    tg: {
      botSubtitle: 'bot vận hành kho & đơn hàng',
      defaultMsg: 'Hệ thống đang chạy: Bảng Bán hàng và Bảng Kho đã kết nối. Mọi đơn mới sẽ tự động đồng bộ tồn kho.',
      syncingMsg: 'Đang đồng bộ đơn #DH-103 sang bảng Kho...',
      syncedFormula1: '="ĐÃ CHỐT ĐƠN"',
      syncedFormula2: '=100 - 5',
      syncedSaleQty: '5',
      syncedSaleStatus: 'ĐÃ CHỐT ĐƠN',
      syncedStockCount: '95 chiếc (-5)',
      syncedStockStatus: 'ĐÃ TRỪ TỒN KHO',
      syncedTgMsg: 'Bảng Kho đã tự động trừ 5 chiếc. Cả 2 bảng tính đã khớp số lượng 95 chiếc.',
      conflictStatusSale: '8 chiếc (Sale sửa)',
      conflictSaleTag: 'CHỜ DUYỆT TRANH CHẤP',
      conflictStatusStock: '98 chiếc (Kho sửa)',
      conflictStockTag: 'XUNG ĐỘT SỐ LIỆU',
      conflictPrompt: 'Đơn #DH-103: Bên Sale sửa thành 8 chiếc, bên Kho sửa thành 2 chiếc. HybridFlow đã giữ nguyên dữ liệu gốc để bạn quyết định:',
      opt1Btn: 'Duyệt số của Sale (8 chiếc)',
      opt2Btn: 'Duyệt số của Kho (2 chiếc)',
      resolve1Formula1: '=8',
      resolve1Formula2: '=100 - 8',
      resolve1SaleQty: '8 chiếc (Đã duyệt)',
      resolve1SaleStatus: 'ĐÃ KHỚP (THEO SALE)',
      resolve1StockCount: '92 chiếc (-8)',
      resolve1StockStatus: 'ĐÃ TRỪ TỒN KHO',
      resolve1Title: 'Đã duyệt theo Sale (8 chiếc)',
      resolve1Desc: 'Cả hai bảng Bán Hàng và Kho đã tự động khớp số lượng 8 chiếc.',
      resolve2Formula1: '=2',
      resolve2Formula2: '=100 - 2',
      resolve2SaleQty: '2 chiếc (Đã duyệt)',
      resolve2SaleStatus: 'ĐÃ KHỚP (THEO KHO)',
      resolve2StockCount: '98 chiếc (-2)',
      resolve2StockStatus: 'ĐÃ TRỪ TỒN KHO',
      resolve2Title: 'Đã duyệt theo Kho (2 chiếc)',
      resolve2Desc: 'Cả hai bảng Bán Hàng và Kho đã tự động khớp số lượng 2 chiếc.',
    },
  },
  edu: {
    name: 'Trung Tâm & Học Phí',
    btnNormal: 'Tình huống 1: Học viên nộp học phí',
    btnConflict: 'Tình huống 2: Sửa trùng nhau',
    sheet1: {
      filename: 'Danh_Sach_Hoc_Vien_K24.xlsx',
      formula: '="CHỜ ĐÓNG TIỀN"',
      tabLabel: 'Sheet 1: Học Viên',
      subtext: 'Bảng nguồn (Phòng Tuyển Sinh)',
      headers: ['A (Mã HV)', 'B (Họ Tên Lớp)', 'C (Học Phí)', 'D (Trạng Thái)'],
      rows: [
        { id: '1', c1: 'HV-2401', c2: 'Nguyễn Hoàng Nam (IELTS)', c3: '6.500.000đ', c4: 'ĐÃ VÀO LỚP', c4Class: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
        { id: '2', c1: 'HV-2402', c2: 'Lê Thuỳ Chi (Giao Tiếp)', c3: '4.200.000đ', c4: 'ĐÃ VÀO LỚP', c4Class: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
        { id: '3', c1: 'HV-2403', c2: 'Trần Minh Đức (IELTS Pro)', c3: '6.500.000đ', c4: 'CHỜ ĐÓNG TIỀN', c4Class: 'text-amber-700 dark:text-amber-400 font-bold', isInteractive: true },
      ],
    },
    sheet2: {
      filename: 'Ke_Toan_Thu_Hoc_Phi.xlsx',
      formula: '=6500000',
      tabLabel: 'Sheet 1: Kế Toán Thu',
      subtext: 'Bảng đích (Phòng Kế Toán)',
      headers: ['A (Mã HV)', 'B (Đã Thu)', 'C (Trạng Thái)'],
      rows: [
        { id: '1', c1: 'HV-2401', c2: '6.500.000đ', c3: 'ĐÃ HOÀN TẤT', c3Class: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
        { id: '2', c1: 'HV-2402', c2: '4.200.000đ', c3: 'ĐÃ HOÀN TẤT', c3Class: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
        { id: '3', c1: 'HV-2403', c2: '0đ (Chưa nộp)', c3: 'CÒN NỢ', c3Class: 'text-amber-700 dark:text-amber-400 font-bold', isInteractive: true },
      ],
    },
    tg: {
      botSubtitle: 'bot quản lý học viên & học phí',
      defaultMsg: 'Hệ thống đang chạy: Bảng Tuyển sinh và Bảng Kế toán đã đồng bộ. Học viên nộp tiền sẽ tự động cập nhật danh sách lớp.',
      syncingMsg: 'Đang đồng bộ xác nhận học phí cho học viên #HV-2403...',
      syncedFormula1: '="ĐÃ NHẬP HỌC"',
      syncedFormula2: '=6500000',
      syncedSaleQty: '6.500.000đ',
      syncedSaleStatus: 'ĐÃ NHẬP HỌC',
      syncedStockCount: '6.500.000đ (Đủ)',
      syncedStockStatus: 'ĐÃ THU ĐỦ',
      syncedTgMsg: 'Học viên #HV-2403 (Trần Minh Đức) đã nộp đủ 6.500.000đ. Đã tự động kích hoạt quyền vào lớp học.',
      conflictStatusSale: '5.5tr (Voucher)',
      conflictSaleTag: 'CHỜ DUYỆT ƯU ĐÃI',
      conflictStatusStock: '6.5tr (Giá niêm yết)',
      conflictStockTag: 'LỆCH MỨC THU',
      conflictPrompt: 'Học viên #HV-2403: Tuyển sinh nhập ưu đãi voucher 5.500.000đ, Kế toán ghi nhận mức chuẩn 6.500.000đ. Vui lòng xác nhận mức duyệt:',
      opt1Btn: 'Duyệt giá Voucher (5.500.000đ)',
      opt2Btn: 'Duyệt giá Chuẩn (6.500.000đ)',
      resolve1Formula1: '=5500000',
      resolve1Formula2: '=5500000',
      resolve1SaleQty: '5.500.000đ (Voucher)',
      resolve1SaleStatus: 'ĐÃ KHỚP (VOUCHER)',
      resolve1StockCount: '5.500.000đ (Đã duyệt)',
      resolve1StockStatus: 'ĐÃ THU ĐỦ',
      resolve1Title: 'Đã duyệt giá Voucher (5.500.000đ)',
      resolve1Desc: 'Cả hai bảng Tuyển Sinh và Kế Toán đã tự động khớp học phí 5.500.000đ.',
      resolve2Formula1: '=6500000',
      resolve2Formula2: '=6500000',
      resolve2SaleQty: '6.500.000đ (Chuẩn)',
      resolve2SaleStatus: 'ĐÃ KHỚP (GIÁ CHUẨN)',
      resolve2StockCount: '6.500.000đ (Đủ)',
      resolve2StockStatus: 'ĐÃ THU ĐỦ',
      resolve2Title: 'Đã duyệt giá Chuẩn (6.500.000đ)',
      resolve2Desc: 'Cả hai bảng Tuyển Sinh và Kế Toán đã tự động khớp mức học phí niêm yết 6.500.000đ.',
    },
  },
  ops: {
    name: 'Vận Hành SME & Thu Chi',
    btnNormal: 'Tình huống 1: Duyệt chi dự án',
    btnConflict: 'Tình huống 2: Sửa trùng nhau',
    sheet1: {
      filename: 'De_Xuat_Chi_Phi_DA.xlsx',
      formula: '="CHỜ DUYỆT CHI"',
      tabLabel: 'Sheet 1: Đề Xuất Chi',
      subtext: 'Bảng nguồn (Bộ Phận Dự Án)',
      headers: ['A (Mã ĐX)', 'B (Hạng Mục Chi)', 'C (Số Tiền)', 'D (Trạng Thái)'],
      rows: [
        { id: '1', c1: 'DX-501', c2: 'License Figma Team', c3: '3.200.000đ', c4: 'ĐÃ CHI', c4Class: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
        { id: '2', c1: 'DX-502', c2: 'Server Staging T11', c3: '2.100.000đ', c4: 'ĐÃ CHI', c4Class: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
        { id: '3', c1: 'DX-503', c2: 'Màn hình 4K Designer', c3: '4.500.000đ', c4: 'CHỜ DUYỆT CHI', c4Class: 'text-amber-700 dark:text-amber-400 font-bold', isInteractive: true },
      ],
    },
    sheet2: {
      filename: 'So_Quy_Tien_Mat_T11.xlsx',
      formula: '=87500000',
      tabLabel: 'Sheet 1: Sổ Quỹ Tiền Mặt',
      subtext: 'Bảng đích (Kế Toán Quỹ)',
      headers: ['A (Mã ĐX)', 'B (Số Dư Quỹ)', 'C (Trạng Thái)'],
      rows: [
        { id: '1', c1: 'DX-501', c2: '89.600.000đ', c3: 'ĐÃ XUẤT TIỀN', c3Class: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
        { id: '2', c1: 'DX-502', c2: '87.500.000đ', c3: 'ĐÃ XUẤT TIỀN', c3Class: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
        { id: '3', c1: 'DX-503', c2: '87.500.000đ', c3: 'CHỜ PHÊ DUYỆT', c3Class: 'text-amber-700 dark:text-amber-400 font-bold', isInteractive: true },
      ],
    },
    tg: {
      botSubtitle: 'bot phê duyệt chi phí & sổ quỹ',
      defaultMsg: 'Hệ thống đang chạy: Bảng Đề xuất chi và Sổ quỹ đã kết nối. Khoản chi được duyệt sẽ tự động cập nhật số dư tiền mặt.',
      syncingMsg: 'Đang đồng bộ đề xuất #DX-503 sang Sổ quỹ tiền mặt...',
      syncedFormula1: '="ĐÃ PHÊ DUYỆT"',
      syncedFormula2: '=87500000 - 4500000',
      syncedSaleQty: '4.500.000đ',
      syncedSaleStatus: 'ĐÃ PHÊ DUYỆT',
      syncedStockCount: '83.000.000đ (-4.5tr)',
      syncedStockStatus: 'ĐÃ XUẤT TIỀN',
      syncedTgMsg: 'Khoản chi #DX-503 (4.500.000đ) đã duyệt chi. Sổ quỹ tiền mặt đã tự động cập nhật số dư 83.000.000đ.',
      conflictStatusSale: '4.2tr (Dự án đề xuất)',
      conflictSaleTag: 'CHỜ DUYỆT CHI',
      conflictStatusStock: '3.9tr (Hóa đơn đỏ)',
      conflictStockTag: 'CHÊNH LỆCH HÓA ĐƠN',
      conflictPrompt: 'Đề xuất #DX-503: Đội Dự án ghi 4.200.000đ, Kế toán kiểm tra hóa đơn đỏ là 3.900.000đ. Vui lòng phê duyệt số tiền chi:',
      opt1Btn: 'Chi theo Hóa Đơn (3.900.000đ)',
      opt2Btn: 'Chi theo Đề Xuất (4.200.000đ)',
      resolve1Formula1: '=3900000',
      resolve1Formula2: '=87500000 - 3900000',
      resolve1SaleQty: '3.900.000đ (Hóa đơn)',
      resolve1SaleStatus: 'ĐÃ KHỚP (HÓA ĐƠN)',
      resolve1StockCount: '83.600.000đ (-3.9tr)',
      resolve1StockStatus: 'ĐÃ XUẤT TIỀN',
      resolve1Title: 'Đã duyệt theo Hóa đơn (3.900.000đ)',
      resolve1Desc: 'Cả hai bảng Đề Xuất và Sổ Quỹ đã tự động khớp số dư 83.600.000đ.',
      resolve2Formula1: '=4200000',
      resolve2Formula2: '=87500000 - 4200000',
      resolve2SaleQty: '4.200.000đ (Đề xuất)',
      resolve2SaleStatus: 'ĐÃ KHỚP (ĐỀ XUẤT)',
      resolve2StockCount: '83.300.000đ (-4.2tr)',
      resolve2StockStatus: 'ĐÃ XUẤT TIỀN',
      resolve2Title: 'Đã duyệt theo Đề xuất (4.200.000đ)',
      resolve2Desc: 'Cả hai bảng Đề Xuất và Sổ Quỹ đã tự động khớp số dư 83.300.000đ.',
    },
  },
};

export interface LandingPageProps {
  loginFailed?: boolean;
  failureReason?: string | null;
}

export function LandingPage({ loginFailed, failureReason }: LandingPageProps) {
  const [industry, setIndustry] = useState<'retail' | 'edu' | 'ops'>('retail');
  const [scenarioState, setScenarioState] = useState<'idle' | 'syncing' | 'synced' | 'conflict' | 'resolve_1' | 'resolve_2'>('idle');
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const saved = localStorage.getItem('hybridflow-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  const lenisRef = useRef<Lenis | null>(null);

  const data = INDUSTRIES[industry];

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      document.documentElement.classList.toggle('dark', next === 'dark');
    }
    try {
      localStorage.setItem('hybridflow-theme', next);
    } catch {}
  }, [theme]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = (event: StorageEvent) => {
      if (event.key === 'hybridflow-theme' || event.key === null) {
        try {
          const saved = localStorage.getItem('hybridflow-theme');
          if (saved === 'light' || saved === 'dark') {
            setTheme(saved);
          }
        } catch {}
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    fetch('/api/v1/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && data.id) {
          setCurrentUser(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleOAuthClick = useCallback(() => {
    try {
      sessionStorage.setItem('hf_login_pending', '1');
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    document.body.style.overflow = 'auto';

    let animFrame: number;
    try {
      const lenis = new Lenis({
        duration: 1.15,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        wheelMultiplier: 0.95,
        touchMultiplier: 1.5,
      });
      lenisRef.current = lenis;

      const raf = (time: number) => {
        lenis.raf(time);
        animFrame = requestAnimationFrame(raf);
      };
      animFrame = requestAnimationFrame(raf);
    } catch {
    }

    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('revealed'));
      return () => {
        if (animFrame) cancelAnimationFrame(animFrame);
        if (lenisRef.current) lenisRef.current.destroy();
        document.body.style.overflow = 'hidden';
      };
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            obs.unobserve(entry.target);
          }
        });
      },
      { root: null, threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    );

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      if (animFrame) cancelAnimationFrame(animFrame);
      if (lenisRef.current) lenisRef.current.destroy();
      document.body.style.overflow = 'hidden';
    };
  }, []);

  const handleAnchorClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    if (targetId.startsWith('#')) {
      const el = document.querySelector(targetId);
      if (el && lenisRef.current) {
        e.preventDefault();
        lenisRef.current.scrollTo(el as HTMLElement, { offset: -30, duration: 1.1 });
      }
    }
  }, []);

  const switchIndustry = useCallback((key: 'retail' | 'edu' | 'ops') => {
    setIndustry(key);
    setScenarioState('idle');
  }, []);

  const runNormal = useCallback(() => {
    setScenarioState('syncing');
    setTimeout(() => {
      setScenarioState('synced');
    }, 500);
  }, []);

  const runConflict = useCallback(() => {
    setScenarioState('conflict');
  }, []);

  const resolveConflict = useCallback((choice: 'opt1' | 'opt2') => {
    setScenarioState(choice === 'opt1' ? 'resolve_1' : 'resolve_2');
  }, []);

  const resetSandbox = useCallback(() => {
    setScenarioState('idle');
  }, []);

  const failureMessages: Record<string, string> = {
    authorization_request_not_found: 'Không tìm thấy phiên đăng nhập Google. Hãy mở ứng dụng bằng localhost:3000 và bắt đầu đăng nhập lại trong cùng trình duyệt.',
    invalid_state_parameter: 'Phiên đăng nhập Google không khớp. Hãy bắt đầu đăng nhập lại.',
    invalid_token_response: 'Backend không đổi được mã Google lấy token. Cần kiểm tra client ID/secret và kết nối từ backend đến Google.',
    invalid_id_token: 'Backend không xác minh được ID token Google. Cần kiểm tra thời gian hệ thống và kết nối đến Google.',
    invalid_user_info_response: 'Backend không lấy được thông tin tài khoản từ Google.',
    access_denied: 'Quyền đăng nhập Google đã bị từ chối hoặc hủy.',
    invalid_client: 'Google từ chối cấu hình OAuth client của backend.',
    invalid_grant: 'Mã đăng nhập Google không còn hợp lệ. Hãy bắt đầu đăng nhập lại.',
  };
  const reasonKey = failureReason || 'authentication_failed';
  const knownReason = Object.prototype.hasOwnProperty.call(failureMessages, reasonKey);

  let currentFormula1 = data.sheet1.formula;
  let currentFormula2 = data.sheet2.formula;
  let cell1RowClass = 'bg-blue-50/40 dark:bg-blue-950/20 transition-colors duration-500';
  let cell2RowClass = 'bg-white dark:bg-[#111724] transition-colors duration-500';
  let cellSaleQtyNode: React.ReactNode = data.sheet1.rows[2].c3;
  let cellSaleStatusNode: React.ReactNode = (
    <>
      <span>{data.sheet1.rows[2].c4}</span>
      <span className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-blue-600"></span>
    </>
  );
  let cellStockCountNode: React.ReactNode = data.sheet2.rows[2].c2;
  let cellStockStatusNode: React.ReactNode = data.sheet2.rows[2].c3;

  if (scenarioState === 'syncing' || scenarioState === 'synced') {
    currentFormula1 = data.tg.syncedFormula1;
    cell1RowClass = 'bg-emerald-50/70 dark:bg-emerald-950/30 transition-colors duration-300';
    cellSaleQtyNode = data.tg.syncedSaleQty;
    cellSaleStatusNode = (
      <>
        <span className="text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded font-bold">{data.tg.syncedSaleStatus}</span>
        <span className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-emerald-600"></span>
      </>
    );

    if (scenarioState === 'synced') {
      currentFormula2 = data.tg.syncedFormula2;
      cell2RowClass = 'bg-emerald-50/70 dark:bg-emerald-950/30 transition-colors duration-300';
      cellStockCountNode = <span className="text-emerald-800 dark:text-emerald-200 font-extrabold bg-emerald-100 dark:bg-emerald-900/60 px-1 rounded">{data.tg.syncedStockCount}</span>;
      cellStockStatusNode = <span className="text-emerald-700 dark:text-emerald-300 font-bold">{data.tg.syncedStockStatus}</span>;
    }
  } else if (scenarioState === 'conflict') {
    currentFormula1 = data.tg.resolve1Formula1;
    cell1RowClass = 'bg-rose-50/60 dark:bg-rose-950/30 transition-colors duration-300';
    cellSaleQtyNode = <span className="text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/60 px-1 rounded font-extrabold animate-pulse">{data.tg.conflictStatusSale}</span>;
    cellSaleStatusNode = <span className="text-amber-800 dark:text-amber-300 font-bold">{data.tg.conflictSaleTag}</span>;

    currentFormula2 = data.tg.resolve1Formula2;
    cell2RowClass = 'bg-amber-50/60 dark:bg-amber-950/30 transition-colors duration-300';
    cellStockCountNode = <span className="text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-1 rounded font-extrabold animate-pulse">{data.tg.conflictStatusStock}</span>;
    cellStockStatusNode = <span className="text-rose-700 dark:text-rose-300 font-bold">{data.tg.conflictStockTag}</span>;
  } else if (scenarioState === 'resolve_1') {
    currentFormula1 = data.tg.resolve1Formula1;
    currentFormula2 = data.tg.resolve1Formula2;
    cell1RowClass = 'bg-emerald-50/50 dark:bg-emerald-950/25 transition-colors duration-300';
    cell2RowClass = 'bg-emerald-50/50 dark:bg-emerald-950/25 transition-colors duration-300';
    cellSaleQtyNode = <span className="text-emerald-800 dark:text-emerald-200 font-bold">{data.tg.resolve1SaleQty}</span>;
    cellSaleStatusNode = <span className="text-emerald-700 dark:text-emerald-300 font-bold">{data.tg.resolve1SaleStatus}</span>;
    cellStockCountNode = <span className="text-emerald-800 dark:text-emerald-200 font-bold">{data.tg.resolve1StockCount}</span>;
    cellStockStatusNode = <span className="text-emerald-700 dark:text-emerald-300 font-bold">{data.tg.resolve1StockStatus}</span>;
  } else if (scenarioState === 'resolve_2') {
    currentFormula1 = data.tg.resolve2Formula1;
    currentFormula2 = data.tg.resolve2Formula2;
    cell1RowClass = 'bg-emerald-50/50 dark:bg-emerald-950/25 transition-colors duration-300';
    cell2RowClass = 'bg-emerald-50/50 dark:bg-emerald-950/25 transition-colors duration-300';
    cellSaleQtyNode = <span className="text-sky-800 dark:text-sky-200 font-bold">{data.tg.resolve2SaleQty}</span>;
    cellSaleStatusNode = <span className="text-sky-700 dark:text-sky-300 font-bold">{data.tg.resolve2SaleStatus}</span>;
    cellStockCountNode = <span className="text-sky-800 dark:text-sky-200 font-bold">{data.tg.resolve2StockCount}</span>;
    cellStockStatusNode = <span className="text-sky-700 dark:text-sky-300 font-bold">{data.tg.resolve2StockStatus}</span>;
  }

  return (
    <div className="landing-page-root bg-[#FAFAFA] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 antialiased selection:bg-emerald-100 selection:text-emerald-900 min-h-screen flex flex-col transition-colors duration-200">
      
      <div className="bg-slate-900 dark:bg-slate-950 text-slate-200 text-xs py-2 px-4 text-center font-medium flex items-center justify-center gap-2 border-b border-slate-800">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          Mới
        </span>
        <span>Chấm dứt việc mất đơn & đè nhầm số liệu giữa các bảng tính.</span>
        <a
          href="#sandbox"
          onClick={(e) => handleAnchorClick(e, '#sandbox')}
          className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-2 ml-1 inline-flex items-center gap-1"
        >
          <span>Thử demo tương tác</span>
          <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </a>
      </div>

      {loginFailed && (
        <div role="alert" className="bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-800 p-4 text-center text-rose-800 dark:text-rose-300 text-sm">
          <p className="font-semibold">{knownReason ? failureMessages[reasonKey] : 'Đăng nhập Google chưa thành công. Kiểm tra log backend để xác định nguyên nhân.'}</p>
          <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-mono-code">Mã lỗi: {knownReason ? reasonKey : 'authentication_failed'}</p>
        </div>
      )}

      
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#0B0F17]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm shadow-emerald-600/30">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
            <div className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">
              Hybrid<span className="text-emerald-600">Flow</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-400">
            <a href="#why" onClick={(e) => handleAnchorClick(e, '#why')} className="hover:text-slate-900 dark:hover:text-white transition-colors">Vì sao cần?</a>
            <a href="#how-it-works" onClick={(e) => handleAnchorClick(e, '#how-it-works')} className="hover:text-slate-900 dark:hover:text-white transition-colors">Cách hoạt động</a>
            <a href="#sandbox" onClick={(e) => handleAnchorClick(e, '#sandbox')} className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 font-semibold transition-colors">Bản tương tác 60s</a>
            <a href="#comparison" onClick={(e) => handleAnchorClick(e, '#comparison')} className="hover:text-slate-900 dark:hover:text-white transition-colors">So sánh</a>
            <a href="#faq" onClick={(e) => handleAnchorClick(e, '#faq')} className="hover:text-slate-900 dark:hover:text-white transition-colors">Hỏi đáp</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
              title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            >
              {theme === 'dark' ? (
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            {currentUser ? (
              <a
                href="/app"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl transition-all shadow-sm active:scale-95"
              >
                <span>Vào Workspace</span>
                <svg className="w-4 h-4 text-emerald-400 dark:text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </a>
            ) : (
              <>
                <a href="/app" className="text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-3 py-2 transition-colors">
                  Đăng nhập
                </a>
                <a
                  href="/api/v1/auth/login/google"
                  onClick={handleOAuthClick}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-all shadow-sm active:scale-95 border border-transparent dark:border-slate-700"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Bắt đầu miễn phí</span>
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center space-y-6 max-w-4xl mx-auto pt-4 sm:pt-10 reveal">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.15]">
              Biến Google Sheets thành <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-slate-900 dark:to-emerald-400">
                trung tâm vận hành tự động
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto font-normal">
              Tự động đồng bộ số liệu hai chiều cho nhóm kinh doanh, trung tâm đào tạo và các phòng ban SME. Chặn đứng lỗi đè mất dữ liệu, nhận cảnh báo duyệt ngay qua Telegram. Không cần đổi phần mềm quen thuộc.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              {currentUser ? (
                <a
                  href="/app"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-md shadow-emerald-600/25 hover:shadow-lg hover:shadow-emerald-600/30 active:scale-[0.98]"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Vào Workspace của bạn
                </a>
              ) : (
                <a
                  href="/api/v1/auth/login/google"
                  onClick={handleOAuthClick}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-md shadow-emerald-600/25 hover:shadow-lg hover:shadow-emerald-600/30 active:scale-[0.98]"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Bắt đầu miễn phí với Google
                </a>
              )}
              <a
                href="#sandbox"
                onClick={(e) => handleAnchorClick(e, '#sandbox')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl transition-all shadow-sm hover:border-slate-400 dark:hover:border-slate-600"
              >
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Thử bản tương tác trực tiếp
              </a>
            </div>

            <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500 font-medium">
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                Giữ nguyên file Google Sheets quen thuộc
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                Cài đặt trong 3 phút, không cần biết code
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                Không cần nhập thẻ tín dụng
              </div>
            </div>
          </div>

          
          <div className="mt-12 lg:mt-16 relative max-w-5xl mx-auto reveal delay-150">
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111724] shadow-xl shadow-slate-200/60 dark:shadow-none overflow-hidden">
              <div className="bg-slate-50/80 dark:bg-[#0E1522] px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">Quy trình: Điều Phối & Đồng Bộ Bảng Tính</span>
                  <span className="text-slate-400 dark:text-slate-500 font-mono-code text-[11px]">(Đa quy trình song song · Chuẩn SRS v1.0)</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-[#182232] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium text-[11px] shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Tự động chạy: <strong>BẬT (Mỗi 5 phút)</strong>
                  </div>
                  <button className="px-3 py-1 rounded-md bg-slate-900 dark:bg-emerald-600 text-white font-medium text-[11px] flex items-center gap-1.5 hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors">
                    <svg className="w-3.5 h-3.5 text-emerald-400 dark:text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
                    </svg>
                    Chạy thử ngay
                  </button>
                </div>
              </div>

              <div className="p-6 sm:p-10 bg-slate-50/40 dark:bg-[#0B0F17]/90 relative overflow-x-auto min-h-[380px] flex items-center justify-center">
                <div className="absolute inset-0 landing-dot-grid opacity-60 pointer-events-none"></div>

                <div className="relative z-10 w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 items-center">
                  <div className="md:col-span-4 bg-white dark:bg-[#151D2A] rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:border-emerald-400 dark:hover:border-emerald-500 transition-all relative group hover:-translate-y-1">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Khối Kích Hoạt</div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white">Bảng Bán Hàng Online</div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400 font-mono-code">
                      <div className="text-slate-500 dark:text-slate-400">Tệp: <span className="text-slate-800 dark:text-slate-200 font-medium">Don_Hang_T11.xlsx</span></div>
                      <div className="text-slate-500 dark:text-slate-400">Khóa so khớp: <span className="text-slate-800 dark:text-slate-200 font-medium">ma_don</span></div>
                      <div className="text-slate-500 dark:text-slate-400">Bản ghi: <span className="text-emerald-700 dark:text-emerald-400 font-bold">1,420 dòng</span></div>
                    </div>
                    <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-emerald-600 text-white items-center justify-center shadow-xs">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </div>
                  </div>

                  <div className="md:col-span-4 bg-white dark:bg-[#151D2A] rounded-xl border-2 border-blue-600/80 dark:border-blue-500 p-4 shadow-md relative group hover:-translate-y-1 transition-all">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">Bộ Lọc & So Khớp</div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white">Tấm Khiên Chống Đè</div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400 font-mono-code">
                      <div className="text-slate-500 dark:text-slate-400">Phát hiện: <span className="text-blue-900 dark:text-blue-300 font-medium">Thay đổi 2 chiều</span></div>
                      <div className="text-slate-500 dark:text-slate-400">Nếu xung đột: <span className="text-amber-700 dark:text-amber-400 font-bold">Hỏi Telegram</span></div>
                      <div className="text-slate-500 dark:text-slate-400">Ghi đè sai: <span className="text-emerald-700 dark:text-emerald-400 font-bold">CHẶN 100%</span></div>
                    </div>
                    <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-blue-600 text-white items-center justify-center shadow-xs">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </div>
                  </div>

                  <div className="md:col-span-4 space-y-3">
                    <div className="bg-white dark:bg-[#151D2A] rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-sm hover:border-teal-400 dark:hover:border-teal-500 transition-all hover:-translate-y-0.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-teal-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                          K
                        </div>
                        <div className="truncate">
                          <div className="text-[10px] text-teal-700 dark:text-teal-400 font-bold uppercase">Khi số liệu sạch</div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">Cập nhật Bảng Tồn Kho</div>
                        </div>
                      </div>
                      <div className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono-code">
                        Tự trừ số lượng khi Sale duyệt đơn
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#151D2A] rounded-xl border border-amber-300 dark:border-amber-700/80 bg-amber-50/20 dark:bg-amber-950/20 p-3.5 shadow-sm hover:border-amber-400 dark:hover:border-amber-600 transition-all hover:-translate-y-0.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-sky-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                          </svg>
                        </div>
                        <div className="truncate">
                          <div className="text-[10px] text-amber-700 dark:text-amber-400 font-bold uppercase">Khi có xung đột</div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">Ping duyệt qua Telegram</div>
                        </div>
                      </div>
                      <div className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono-code">
                        Quản lý duyệt 1 chạm ngay trên Telegram di động
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-[#0E1522] px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400"></span>
                  <span>Trạng thái: <strong className="text-slate-700 dark:text-slate-200">Đang kết nối 2 Google Sheets</strong></span>
                </div>
                <div className="flex items-center gap-4 font-mono-code text-[10px]">
                  <span>Đồng bộ gần nhất: 12 giây trước</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Tốc độ: 0.4s</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      
      <section id="why" className="py-20 bg-white dark:bg-[#0B0F17] border-y border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14 reveal">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Vì sao các nhóm vận hành cần HybridFlow?
            </h2>
            <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
              Đừng để bảng tính làm bạn đau đầu mỗi ngày. Xem sự khác biệt giữa quản lý thủ công và tự động hóa với HybridFlow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111724] p-6 sm:p-8 shadow-sm flex flex-col justify-between reveal delay-100 transition-all hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md">
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 font-bold">
                    <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Quản lý bảng tính thủ công</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Copy paste, nhắn tin hỏi han, dễ nhầm lẫn</p>
                  </div>
                </div>

                <ul className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span><strong>Mất mát & ghi đè số liệu:</strong> 2 người cùng chỉnh 1 dòng, số liệu bị đè mất mà không hề hay biết.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span><strong>Lệch tồn kho & nợ học phí:</strong> Bên Bán hàng chốt đơn nhưng bảng Kho chưa cập nhật, dẫn tới giao thiếu.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span><strong>Tốn hàng giờ đối soát:</strong> Cuối ngày phải ngồi so khớp từng dòng giữa các bảng Excel rời rạc.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-emerald-500 bg-white dark:bg-[#111724] p-6 sm:p-8 shadow-md flex flex-col justify-between relative overflow-hidden ring-4 ring-emerald-500/10 reveal delay-200 transition-all hover:shadow-xl hover:ring-emerald-500/20">
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tự động với HybridFlow</h3>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Bảo vệ số liệu 24/7, đồng bộ 2 chiều</p>
                  </div>
                </div>

                <ul className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
                  <li className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span><strong>Bảo vệ 100% chống ghi đè:</strong> Thuật toán 3-Way Diff phát hiện xung đột tức thì, giữ nguyên số liệu an toàn.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span><strong>Tự động nhảy số hai chiều:</strong> Sale duyệt đơn → Kho tự trừ. Kế toán thu tiền → Lớp học tự kích hoạt.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span><strong>Duyệt 1 chạm qua Telegram:</strong> Khi có số liệu nghi vấn, điện thoại nhận tin kèm nút bấm để chốt số ngay.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      
      <section id="how-it-works" className="py-20 bg-slate-50/50 dark:bg-[#0E131D]/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 reveal">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              3 bước đơn giản để tự động hóa bảng tính
            </h2>
            <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
              Không cần thuê lập trình viên. Bạn tự thiết lập quy trình vận hành chỉ trong 3 phút.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="relative bg-slate-50/70 dark:bg-[#111724] p-6 sm:p-8 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col justify-between reveal delay-100 transition-all hover:-translate-y-1 hover:shadow-md hover:bg-white dark:hover:bg-[#151D2A]">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  1
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Kết nối Google Sheets</h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Đăng nhập an toàn bằng tài khoản Google. Chọn file bảng tính Bán Hàng, Kho hoặc Học Viên có sẵn của bạn.
                </p>
              </div>
            </div>

            <div className="relative bg-slate-50/70 dark:bg-[#111724] p-6 sm:p-8 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col justify-between reveal delay-200 transition-all hover:-translate-y-1 hover:shadow-md hover:bg-white dark:hover:bg-[#151D2A]">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  2
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Thiết lập quy tắc Khi - Nếu - Thì</h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Ví dụ: Khi cột Trạng thái đổi thành "Đã Chốt", thì tự động trừ số lượng ở bảng Kho tương ứng theo Mã sản phẩm.
                </p>
              </div>
            </div>

            <div className="relative bg-slate-50/70 dark:bg-[#111724] p-6 sm:p-8 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col justify-between reveal delay-300 transition-all hover:-translate-y-1 hover:shadow-md hover:bg-white dark:hover:bg-[#151D2A]">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  3
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Giám sát & Duyệt qua Telegram</h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Hệ thống chạy ngầm 24/7. Bạn chỉ cần mở điện thoại duyệt khi có xung đột dữ liệu hoặc nhận báo cáo tổng hợp.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      
      <section id="sandbox" className="py-20 bg-slate-50/70 dark:bg-[#090D14] border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-6 reveal">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Thấy tận mắt: Bảng tính tự nhảy số trong thực tế
            </h2>
            <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
              Chọn lĩnh vực của bạn để trải nghiệm cách HybridFlow kết nối dữ liệu hai chiều, tự động trừ số liệu và gửi tin nhắn phê duyệt tức thì:
            </p>
          </div>

          <div className="flex items-center justify-center mb-8 reveal delay-75">
            <div className="inline-flex p-1.5 bg-slate-200/80 dark:bg-slate-800/80 rounded-2xl border border-slate-300 dark:border-slate-700 gap-1.5 shadow-inner">
              <button
                onClick={() => switchIndustry('retail')}
                className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
                  industry === 'retail'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-800/50'
                }`}
              >
                <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                <span>Bán Hàng & Kho Vận</span>
              </button>

              <button
                onClick={() => switchIndustry('edu')}
                className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
                  industry === 'edu'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-800/50'
                }`}
              >
                <svg className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5" />
                </svg>
                <span>Trung Tâm & Học Phí</span>
              </button>

              <button
                onClick={() => switchIndustry('ops')}
                className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
                  industry === 'ops'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-800/50'
                }`}
              >
                <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span>Vận Hành SME & Thu Chi</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6 bg-white/95 dark:bg-[#111724]/95 backdrop-blur-md p-2 sm:p-2.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm reveal delay-150">
            <div className="w-full sm:w-auto flex flex-wrap items-center gap-2">
              <button
                onClick={runNormal}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 active:scale-95 shadow-xs cursor-pointer ${
                  scenarioState === 'syncing' || scenarioState === 'synced'
                    ? 'bg-emerald-600 text-white shadow-emerald-600/25 ring-2 ring-emerald-500/30'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>{data.btnNormal}</span>
              </button>

              <button
                onClick={runConflict}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 active:scale-95 shadow-xs cursor-pointer ${
                  scenarioState === 'conflict'
                    ? 'bg-amber-600 text-white shadow-amber-600/25 ring-2 ring-amber-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700'
                }`}
              >
                <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{data.btnConflict}</span>
              </button>

              <button
                onClick={resetSandbox}
                title="Đặt lại bảng tính về trạng thái ban đầu"
                className="px-2.5 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Đặt lại</span>
              </button>
            </div>

            <div className="w-full sm:w-auto text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 px-3.5 py-1.5 rounded-xl flex items-center justify-center sm:justify-start gap-2 shrink-0">
              {scenarioState === 'idle' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Trạng thái: <strong>Sẵn sàng trải nghiệm</strong></span>
                </>
              )}
              {scenarioState === 'syncing' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span className="text-amber-800 dark:text-amber-300 font-semibold">Đang đồng bộ...</span>
                </>
              )}
              {scenarioState === 'synced' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-emerald-700 dark:text-emerald-300 font-semibold">Đồng bộ hoàn tất (Khớp 100%)</span>
                </>
              )}
              {scenarioState === 'conflict' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                  <span className="text-rose-700 dark:text-rose-300 font-semibold">Phát hiện xung đột! Gửi Telegram</span>
                </>
              )}
              {(scenarioState === 'resolve_1' || scenarioState === 'resolve_2') && (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-emerald-700 dark:text-emerald-300 font-semibold">Đã giải quyết tranh chấp an toàn</span>
                </>
              )}
            </div>
          </div>

          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center reveal delay-225">
            
            <div className="lg:col-span-7 xl:col-span-7 space-y-3.5">
              <div className="bg-white dark:bg-[#111724] rounded-xl border border-slate-300/80 dark:border-slate-800 shadow-md overflow-hidden">
                <div className="bg-slate-50 dark:bg-[#151D2A] px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                      </svg>
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px] truncate">{data.sheet1.filename}</div>
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400"></span>
                        <span>Đã kết nối HybridFlow</span>
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    <span>Tệp</span>
                    <span>Chỉnh sửa</span>
                    <span>Xem</span>
                    <span>Dữ liệu</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-[#0E1522] px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-[11px] font-mono-code text-slate-600 dark:text-slate-400">
                  <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700 text-[10px]">E3</span>
                  <span className="text-slate-400 font-bold">fx</span>
                  <span className="text-slate-800 dark:text-slate-200 truncate">{currentFormula1}</span>
                </div>

                <div className="overflow-x-auto text-[11px] font-mono-code select-none">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-[#151D2A] text-slate-600 dark:text-slate-300 border-b border-slate-300 dark:border-slate-700">
                        <th className="w-8 py-1 text-center font-normal border-r border-slate-300 dark:border-slate-700 bg-slate-200/60 dark:bg-slate-800/60"></th>
                        <th className="py-1 px-2.5 text-left font-semibold border-r border-slate-200 dark:border-slate-700">{data.sheet1.headers[0]}</th>
                        <th className="py-1 px-2.5 text-left font-semibold border-r border-slate-200 dark:border-slate-700">{data.sheet1.headers[1]}</th>
                        <th className="py-1 px-2.5 text-center font-semibold border-r border-slate-200 dark:border-slate-700">{data.sheet1.headers[2]}</th>
                        <th className="py-1 px-2.5 text-left font-semibold">{data.sheet1.headers[3]}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#111724] tab-fade-in" key={industry + '_sheet1'}>
                      <tr className="text-slate-700 dark:text-slate-300 hover:bg-slate-50/80 dark:hover:bg-[#182232]">
                        <td className="text-center bg-slate-100 dark:bg-[#151D2A] text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-800 text-[10px]">{data.sheet1.rows[0].id}</td>
                        <td className="py-1.5 px-2.5 font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">{data.sheet1.rows[0].c1}</td>
                        <td className="py-1.5 px-2.5 border-r border-slate-200 dark:border-slate-800 truncate max-w-[140px]">{data.sheet1.rows[0].c2}</td>
                        <td className="py-1.5 px-2.5 text-center border-r border-slate-200 dark:border-slate-800 font-mono-code">{data.sheet1.rows[0].c3}</td>
                        <td className={`py-1.5 px-2.5 ${data.sheet1.rows[0].c4Class}`}>{data.sheet1.rows[0].c4}</td>
                      </tr>
                      <tr className="text-slate-700 dark:text-slate-300 hover:bg-slate-50/80 dark:hover:bg-[#182232]">
                        <td className="text-center bg-slate-100 dark:bg-[#151D2A] text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-800 text-[10px]">{data.sheet1.rows[1].id}</td>
                        <td className="py-1.5 px-2.5 font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">{data.sheet1.rows[1].c1}</td>
                        <td className="py-1.5 px-2.5 border-r border-slate-200 dark:border-slate-800 truncate max-w-[140px]">{data.sheet1.rows[1].c2}</td>
                        <td className="py-1.5 px-2.5 text-center border-r border-slate-200 dark:border-slate-800 font-mono-code">{data.sheet1.rows[1].c3}</td>
                        <td className={`py-1.5 px-2.5 ${data.sheet1.rows[1].c4Class}`}>{data.sheet1.rows[1].c4}</td>
                      </tr>
                      <tr className={cell1RowClass}>
                        <td className="text-center bg-slate-100 dark:bg-[#151D2A] text-slate-700 dark:text-slate-300 font-bold border-r border-slate-200 dark:border-slate-800 text-[10px]">{data.sheet1.rows[2].id}</td>
                        <td className="py-1.5 px-2.5 font-extrabold text-blue-900 dark:text-blue-400 border-r border-slate-200 dark:border-slate-800">{data.sheet1.rows[2].c1}</td>
                        <td className="py-1.5 px-2.5 font-medium text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">{data.sheet1.rows[2].c2}</td>
                        <td className="py-1.5 px-2.5 text-center font-bold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 transition-all font-mono-code">
                          {cellSaleQtyNode}
                        </td>
                        <td className="py-1.5 px-2.5 font-bold text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 relative transition-all">
                          {cellSaleStatusNode}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-100 dark:bg-[#151D2A] px-3 py-1.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1">
                    <span className="bg-white dark:bg-[#111724] px-2 py-0.5 rounded-t font-semibold text-slate-800 dark:text-slate-200 border-b-2 border-emerald-600 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-emerald-600 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 4h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>{data.sheet1.tabLabel}</span>
                    </span>
                  </div>
                  <span className="text-slate-500 dark:text-slate-400 font-sans">{data.sheet1.subtext}</span>
                </div>
              </div>

              <div className="flex items-center justify-center py-0.5">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-white dark:bg-[#151D2A] rounded-full border border-slate-200 dark:border-slate-800 shadow-xs text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  <svg className="w-3.5 h-3.5 text-emerald-600 animate-pulse shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  <span>HybridFlow đồng bộ hai chiều tức thì (≤ 0.4s)</span>
                </div>
              </div>

              <div className="bg-white dark:bg-[#111724] rounded-xl border border-slate-300/80 dark:border-slate-800 shadow-md overflow-hidden">
                <div className="bg-slate-50 dark:bg-[#151D2A] px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded bg-teal-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                      </svg>
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px] truncate">{data.sheet2.filename}</div>
                      <div className="text-[10px] text-teal-700 dark:text-teal-400 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400"></span>
                        <span>Đồng bộ hai chiều tức thì</span>
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    <span>Tệp</span>
                    <span>Dữ liệu</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-[#0E1522] px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-[11px] font-mono-code text-slate-600 dark:text-slate-400">
                  <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700 text-[10px]">C3</span>
                  <span className="text-slate-400 font-bold">fx</span>
                  <span className="text-slate-800 dark:text-slate-200 truncate">{currentFormula2}</span>
                </div>

                <div className="overflow-x-auto text-[11px] font-mono-code select-none">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-[#151D2A] text-slate-600 dark:text-slate-300 border-b border-slate-300 dark:border-slate-700">
                        <th className="w-8 py-1 text-center font-normal border-r border-slate-300 dark:border-slate-700 bg-slate-200/60 dark:bg-slate-800/60"></th>
                        <th className="py-1 px-2.5 text-left font-semibold border-r border-slate-200 dark:border-slate-700">{data.sheet2.headers[0]}</th>
                        <th className="py-1 px-2.5 text-center font-semibold border-r border-slate-200 dark:border-slate-700">{data.sheet2.headers[1]}</th>
                        <th className="py-1 px-2.5 text-left font-semibold">{data.sheet2.headers[2]}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#111724] tab-fade-in" key={industry + '_sheet2'}>
                      <tr className="text-slate-700 dark:text-slate-300 hover:bg-slate-50/80 dark:hover:bg-[#182232]">
                        <td className="text-center bg-slate-100 dark:bg-[#151D2A] text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-800 text-[10px]">{data.sheet2.rows[0].id}</td>
                        <td className="py-1.5 px-2.5 font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">{data.sheet2.rows[0].c1}</td>
                        <td className="py-1.5 px-2.5 text-center border-r border-slate-200 dark:border-slate-800 font-mono-code">{data.sheet2.rows[0].c2}</td>
                        <td className={`py-1.5 px-2.5 ${data.sheet2.rows[0].c3Class}`}>{data.sheet2.rows[0].c3}</td>
                      </tr>
                      <tr className="text-slate-700 dark:text-slate-300 hover:bg-slate-50/80 dark:hover:bg-[#182232]">
                        <td className="text-center bg-slate-100 dark:bg-[#151D2A] text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-800 text-[10px]">{data.sheet2.rows[1].id}</td>
                        <td className="py-1.5 px-2.5 font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">{data.sheet2.rows[1].c1}</td>
                        <td className="py-1.5 px-2.5 text-center border-r border-slate-200 dark:border-slate-800 font-mono-code">{data.sheet2.rows[1].c2}</td>
                        <td className={`py-1.5 px-2.5 ${data.sheet2.rows[1].c3Class}`}>{data.sheet2.rows[1].c3}</td>
                      </tr>
                      <tr className={cell2RowClass}>
                        <td className="text-center bg-slate-100 dark:bg-[#151D2A] text-slate-700 dark:text-slate-300 font-bold border-r border-slate-200 dark:border-slate-800 text-[10px]">{data.sheet2.rows[2].id}</td>
                        <td className="py-1.5 px-2.5 font-extrabold text-teal-900 dark:text-teal-400 border-r border-slate-200 dark:border-slate-800">{data.sheet2.rows[2].c1}</td>
                        <td className="py-1.5 px-2.5 text-center font-bold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 transition-all font-mono-code">
                          {cellStockCountNode}
                        </td>
                        <td className="py-1.5 px-2.5 font-bold text-emerald-700 dark:text-emerald-300 transition-all">
                          {cellStockStatusNode}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-100 dark:bg-[#151D2A] px-3 py-1.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1">
                    <span className="bg-white dark:bg-[#111724] px-2 py-0.5 rounded-t font-semibold text-slate-800 dark:text-slate-200 border-b-2 border-teal-600 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-teal-600 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      <span>{data.sheet2.tabLabel}</span>
                    </span>
                  </div>
                  <span className="text-slate-500 dark:text-slate-400 font-sans">{data.sheet2.subtext}</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 xl:col-span-5 flex flex-col items-center justify-center">
              <div className="w-full max-w-[340px] rounded-[36px] border-4 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-2.5 shadow-xl relative">
                <div className="w-20 h-3.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-2"></div>

                <div className="bg-[#517DA2] dark:bg-[#1E3048] text-white rounded-t-[22px] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-xs leading-none">HybridFlow Bot</div>
                      <div className="text-[10px] text-sky-200 mt-0.5">{data.tg.botSubtitle}</div>
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                </div>

                <div className="bg-[#8E9FA9]/20 dark:bg-[#0C131D]/90 p-3 rounded-b-[22px] min-h-[360px] flex flex-col justify-end text-xs space-y-2.5">
                  <div className="bg-white dark:bg-[#162232] text-slate-800 dark:text-slate-100 border border-slate-100/60 dark:border-slate-700/50 p-2.5 rounded-xl rounded-tl-none shadow-xs max-w-[95%]">
                    <div className="text-[11px] leading-relaxed flex items-start gap-1.5">
                      <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span>{data.tg.defaultMsg}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 dark:text-slate-500 text-right mt-1 font-mono-code flex items-center justify-end gap-0.5">
                      <span>09:30</span>
                      <svg className="w-3 h-3 text-sky-500 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7m-5 0l4 4" />
                      </svg>
                    </div>
                  </div>

                  {scenarioState === 'conflict' && (
                    <div className="bg-white dark:bg-[#162232] text-slate-800 dark:text-slate-100 p-2.5 rounded-xl rounded-tl-none shadow-md border-l-4 border-amber-500 max-w-[95%] tg-bubble-animate">
                      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold text-[11px]">
                        <svg className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>Cảnh báo xung đột số liệu!</span>
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-1 leading-snug">{data.tg.conflictPrompt}</p>
                      <div className="mt-2.5 space-y-1.5">
                        <button
                          onClick={() => resolveConflict('opt1')}
                          className="w-full py-1.5 px-2 bg-[#2481cc] hover:bg-[#1e6cb0] text-white rounded-lg font-bold text-[10px] transition-colors text-center shadow-xs cursor-pointer"
                        >
                          {data.tg.opt1Btn}
                        </button>
                        <button
                          onClick={() => resolveConflict('opt2')}
                          className="w-full py-1.5 px-2 bg-slate-700 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-750 text-white rounded-lg font-bold text-[10px] transition-colors text-center shadow-xs cursor-pointer"
                        >
                          {data.tg.opt2Btn}
                        </button>
                      </div>
                      <div className="text-[9px] text-slate-400 dark:text-slate-500 text-right mt-1 font-mono-code">Vừa xong</div>
                    </div>
                  )}

                  {scenarioState === 'resolve_1' && (
                    <div className="bg-white dark:bg-[#162232] text-slate-800 dark:text-slate-100 p-2.5 rounded-xl rounded-tl-none shadow-md border-l-4 border-emerald-500 max-w-[95%] tg-bubble-animate">
                      <div className="text-[11px] text-emerald-800 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 inline shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{data.tg.resolve1Title}</span>
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-1">{data.tg.resolve1Desc}</p>
                      <div className="text-[9px] text-slate-400 dark:text-slate-500 text-right mt-1 font-mono-code flex items-center justify-end gap-0.5">
                        <span>Vừa xong</span>
                        <svg className="w-3 h-3 text-emerald-600 dark:text-emerald-400 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7m-5 0l4 4" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {scenarioState === 'resolve_2' && (
                    <div className="bg-white dark:bg-[#162232] text-slate-800 dark:text-slate-100 p-2.5 rounded-xl rounded-tl-none shadow-md border-l-4 border-sky-500 max-w-[95%] tg-bubble-animate">
                      <div className="text-[11px] text-sky-800 dark:text-sky-400 font-bold flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 inline shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{data.tg.resolve2Title}</span>
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-1">{data.tg.resolve2Desc}</p>
                      <div className="text-[9px] text-slate-400 dark:text-slate-500 text-right mt-1 font-mono-code flex items-center justify-end gap-0.5">
                        <span>Vừa xong</span>
                        <svg className="w-3 h-3 text-sky-600 dark:text-sky-400 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7m-5 0l4 4" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {scenarioState === 'synced' && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/80 p-2.5 rounded-xl rounded-tl-none text-[10px] leading-snug shadow-xs tg-bubble-animate">
                      <div className="flex items-start gap-1.5">
                        <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{data.tg.syncedTgMsg}</span>
                      </div>
                      <div className="text-[9px] text-emerald-600/70 dark:text-emerald-400/70 text-right mt-1 font-mono-code flex items-center justify-end gap-0.5">
                        <span>Vừa xong</span>
                        <svg className="w-3 h-3 text-emerald-600 dark:text-emerald-400 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7m-5 0l4 4" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-28 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-2"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      
      <section id="features" className="py-20 bg-white dark:bg-[#0B0F17]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 reveal">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Tính năng bảo vệ doanh nghiệp toàn diện
            </h2>
            <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
              Được thiết kế tỉ mỉ dựa trên các lỗi thực tế hàng đầu khiến các nhóm vận hành thất thoát doanh thu.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-6xl mx-auto">
            <div className="md:col-span-8 bg-slate-50 dark:bg-[#111724] rounded-2xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between reveal delay-100 transition-all hover:-translate-y-1 hover:shadow-md hover:bg-white dark:hover:bg-[#151D2A]">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
                  <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Thuật toán 3-Way Diff chống ghi đè</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  So sánh đồng thời 3 phiên bản: dữ liệu ban đầu, dữ liệu từ Bảng Nguồn và dữ liệu từ Bảng Đích. Nếu cả hai người cùng sửa một ô, hệ thống không tự ý chọn bên nào mà giữ nguyên và gửi câu hỏi xin phê duyệt.
                </p>
              </div>
            </div>

            <div className="md:col-span-4 bg-slate-50 dark:bg-[#111724] rounded-2xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between reveal delay-200 transition-all hover:-translate-y-1 hover:shadow-md hover:bg-white dark:hover:bg-[#151D2A]">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-950/60 flex items-center justify-center text-teal-700 dark:text-teal-400">
                  <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Hộp đen lưu vết (Snapshot)</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Mọi thay đổi đều được ghi lại ảnh chụp trước và sau. Ai sửa gì, vào lúc mấy giờ đều được truy vết minh bạch.
                </p>
              </div>
            </div>

            <div className="md:col-span-4 bg-slate-50 dark:bg-[#111724] rounded-2xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between reveal delay-150 transition-all hover:-translate-y-1 hover:shadow-md hover:bg-white dark:hover:bg-[#151D2A]">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/60 flex items-center justify-center text-sky-700 dark:text-sky-400">
                  <svg className="w-5 h-5 text-sky-600 dark:text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Bộ quy tắc Khi - Nếu - Thì</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Thiết lập linh hoạt cho mọi nghiệp vụ: Chốt đơn → trừ kho; Đóng học phí → mở quyền học; Duyệt chi → trừ quỹ.
                </p>
              </div>
            </div>

            <div className="md:col-span-8 bg-slate-50 dark:bg-[#111724] rounded-2xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between reveal delay-250 transition-all hover:-translate-y-1 hover:shadow-md hover:bg-white dark:hover:bg-[#151D2A]">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-700 dark:text-indigo-400">
                  <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Không giới hạn quy trình chạy song song</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Quản lý nhiều bảng tính cùng lúc: Bán hàng, Kho, Kế toán, Chăm sóc khách hàng. Mỗi quy trình chạy độc lập và không bao giờ gây nghẽn dữ liệu của nhau.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="py-20 bg-white dark:bg-[#0B0F17] border-t border-slate-200/80 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 reveal">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Câu hỏi thường gặp từ các nhóm vận hành & doanh nghiệp
            </h2>
          </div>

          <div className="space-y-4 reveal delay-150">
            <details className="group bg-slate-50 dark:bg-[#111724] rounded-xl p-5 border border-slate-200/80 dark:border-slate-800 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between cursor-pointer font-bold text-slate-900 dark:text-white text-sm">
                <span>Dữ liệu bảng tính của tôi có được an toàn và bảo mật không?</span>
                <svg className="w-4 h-4 ml-4 shrink-0 transition-transform group-open:rotate-180 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <p className="mt-3 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Tuyệt đối an toàn. HybridFlow sử dụng tiêu chuẩn xác thực chính thức của Google (OAuth 2.0). Dữ liệu của bạn được mã hóa hoàn toàn và bạn có quyền thu hồi quyền truy cập bất kỳ lúc nào ngay trong tài khoản Google.
              </p>
            </details>

            <details className="group bg-slate-50 dark:bg-[#111724] rounded-xl p-5 border border-slate-200/80 dark:border-slate-800 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between cursor-pointer font-bold text-slate-900 dark:text-white text-sm">
                <span>Tôi không biết gì về lập trình hay IT thì có tự cài được không?</span>
                <svg className="w-4 h-4 ml-4 shrink-0 transition-transform group-open:rotate-180 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <p className="mt-3 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Có! Giao diện được thiết kế hoàn toàn không cần code (No-Code). Bạn chỉ cần đăng nhập Google, chọn file bảng tính có sẵn và nối 2 bảng bằng cách chọn tên cột (ví dụ: "Mã đơn" với "Mã đơn", hoặc "Mã học viên" với "Mã học viên").
              </p>
            </details>

            <details className="group bg-slate-50 dark:bg-[#111724] rounded-xl p-5 border border-slate-200/80 dark:border-slate-800 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between cursor-pointer font-bold text-slate-900 dark:text-white text-sm">
                <span>Nếu nhân viên của tôi lỡ tay nhập sai thì có khôi phục được không?</span>
                <svg className="w-4 h-4 ml-4 shrink-0 transition-transform group-open:rotate-180 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <p className="mt-3 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Được ngay lập tức. Tính năng "Hộp đen lưu vết" lưu lại toàn bộ ảnh chụp dữ liệu trước khi thay đổi. Bạn có thể xem lại số liệu cũ và khôi phục chỉ với 1 cú click chuột.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="py-16 bg-slate-900 dark:bg-slate-950 text-white relative overflow-hidden border-t border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 space-y-6 reveal">
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Chấm dứt cảnh thức đến nửa đêm đối soát bảng tính
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-sm sm:text-base">
            Biến Google Sheets thành trung tâm vận hành tự động, tin cậy và không bao giờ lệch số liệu. Khởi tạo miễn phí chỉ mất 3 phút.
          </p>
          <div className="pt-2">
            {currentUser ? (
              <a
                href="/app"
                className="inline-flex items-center gap-3 px-8 py-4 text-base font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
              >
                <span>Mở Workspace làm việc ngay</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </a>
            ) : (
              <a
                href="/api/v1/auth/login/google"
                onClick={handleOAuthClick}
                className="inline-flex items-center gap-3 px-8 py-4 text-base font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Kết nối Google Sheets & Bắt đầu ngay</span>
              </a>
            )}
          </div>
        </div>
      </section>

      
      <footer className="bg-slate-950 text-slate-400 py-8 border-t border-slate-800 text-xs text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center text-white font-bold text-[10px]">
              HF
            </div>
            <span className="font-semibold text-slate-300">HybridFlow</span>
            <span>— Tự động hóa & đồng bộ bảng tính đa phòng ban</span>
          </div>
          <div>© 2026 HybridFlow. Bảo vệ dữ liệu theo tiêu chuẩn OAuth 2.0 của Google.</div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;

