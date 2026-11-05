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

export const INDUSTRIES: Record<'retail' | 'edu' | 'ops', IndustryData> = {
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

